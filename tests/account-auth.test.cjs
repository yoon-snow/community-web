const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");

function loadAuth({
  who = { user: { id: "verified-user" }, member: null, admin: false },
  auth = {},
  configured = true,
} = {}) {
  const cache = new Map();
  const calls = [];
  const db = {
    auth: {
      signInWithPassword: async (input) => {
        calls.push(["signin", input]);
        return { error: null };
      },
      signUp: async (input) => {
        calls.push(["signup", input]);
        return {
          data: { user: { id: "new-user" }, session: null },
          error: null,
        };
      },
      resetPasswordForEmail: async (email, options) => {
        calls.push(["request-reset", email, options]);
        return { error: null };
      },
      getUser: async () => ({ data: { user: who.user }, error: null }),
      updateUser: async (input) => {
        calls.push(["update-password", input]);
        return { error: null };
      },
      signOut: async (input) => {
        calls.push(["signout", input]);
        return { error: null };
      },
      verifyOtp: async (input) => {
        calls.push(["verify", input]);
        return {
          data: {
            user:
              typeof who === "function" ? { id: "recovery-user" } : who.user,
          },
          error: null,
        };
      },
      exchangeCodeForSession: async (code) => {
        calls.push(["exchange", code]);
        return { data: { user: who.user }, error: null };
      },
      ...auth,
    },
    from() {
      throw new Error("Auth must not create, link, or activate a member row");
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const module = { exports: {} };
    new Function("exports", "require", "module", source)(
      module.exports,
      (name) => {
        if (name === "next/server")
          return {
            NextResponse: {
              redirect: (url) =>
                new Response(null, {
                  status: 307,
                  headers: { location: String(url) },
                }),
            },
          };
        if (name === "@/lib/supabase/server")
          return {
            configured: () => configured,
            serverClient: async () => db,
            identity: async () => (typeof who === "function" ? who() : who),
          };
        if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
        return require(name);
      },
      module,
    );
    cache.set(file, module.exports);
    return module.exports;
  }
  return {
    calls,
    route: load("src/app/api/auth/[action]/route.ts"),
    confirm: load("src/app/auth/confirm/route.ts"),
    callback: load("src/app/auth/callback/route.ts"),
    login: load("src/app/auth/login/route.ts"),
  };
}
function post(loaded, action, data, origin = "https://club.example.invalid") {
  return loaded.route.POST(
    new Request("https://club.example.invalid/api/auth/" + action, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ action }) },
  );
}
const password = "test-password-2026";

test("password signin uses verified DB roles, strips forged roles/redirects and never returns credentials or tokens", async () => {
  for (const [who, next] of [
    [
      { user: { id: "verified" }, member: { id: "member" }, admin: true },
      "/admin",
    ],
    [{ user: { id: "verified" }, member: { id: "member" }, admin: false }, "/"],
    [{ user: { id: "verified" }, member: null, admin: false }, "/join"],
  ]) {
    const loaded = loadAuth({ who });
    const response = await post(loaded, "signin", {
      email: "  Member@Example.Invalid ",
      password,
      role: "admin",
      next: "https://evil.invalid",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { next });
    assert.deepEqual(loaded.calls, [
      ["signin", { email: "member@example.invalid", password }],
    ]);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});
test("wrong credentials have a generic failure and provider error text never discloses passwords or account metadata", async () => {
  const loaded = loadAuth({
    auth: {
      signInWithPassword: async () => ({
        error: { status: 400, message: `private ${password} not a user` },
      }),
    },
  });
  const response = await post(loaded, "signin", {
    email: "missing@example.invalid",
    password,
  });
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes(password));
  const limited = loadAuth({
    auth: {
      signInWithPassword: async () => ({
        error: { status: 429, code: "over_request_rate_limit" },
      }),
    },
  });
  assert.equal(
    (
      await post(limited, "signin", {
        email: "member@example.invalid",
        password,
      })
    ).status,
    429,
  );
});
test("signup requires matching long passwords and creates only an Auth account, not an active member", async () => {
  const loaded = loadAuth();
  for (const input of [
    { password: "short", password_confirm: "short" },
    { password, password_confirm: "different" },
  ])
    assert.equal(
      (await post(loaded, "signup", { email: "new@example.invalid", ...input }))
        .status,
      400,
    );
  assert.equal(loaded.calls.length, 0);
  const result = await post(loaded, "signup", {
    email: "New@Example.Invalid",
    password,
    password_confirm: password,
    role: "admin",
    member_id: "forged",
  });
  assert.equal(result.status, 201);
  const data = await result.json();
  assert.equal(data.next, undefined);
  assert.ok(data.message);
  const input = loaded.calls[0][1];
  assert.deepEqual(Object.keys(input).sort(), ["email", "options", "password"]);
  assert.equal(input.email, "new@example.invalid");
  assert.ok(input.options.emailRedirectTo.endsWith("/auth/callback"));
});
test("existing-account signup and unknown-address password reset use non-enumerating messages", async () => {
  const normal = loadAuth();
  const duplicate = loadAuth({
    auth: {
      signUp: async () => ({
        data: { session: null },
        error: { code: "user_already_exists" },
      }),
    },
  });
  const input = {
    email: "someone@example.invalid",
    password,
    password_confirm: password,
  };
  assert.deepEqual(
    await (await post(normal, "signup", input)).json(),
    await (await post(duplicate, "signup", input)).json(),
  );
  const response = await post(normal, "request-reset", {
    email: "Unknown@Example.Invalid",
    redirectTo: "https://evil.invalid",
    role: "admin",
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes("Unknown@"));
  assert.ok(!text.includes("evil.invalid"));
  const call = normal.calls.at(-1);
  assert.equal(call[1], "unknown@example.invalid");
  assert.ok(call[2].redirectTo.endsWith("/auth/callback?flow=recovery"));
});
test("password updates require a verified session, change only the current account and sign out globally", async () => {
  const anonymous = loadAuth({
    who: { user: null, member: null, admin: false },
  });
  assert.equal(
    (
      await post(anonymous, "update-password", {
        password,
        password_confirm: password,
      })
    ).status,
    401,
  );
  assert.equal(anonymous.calls.length, 0);
  const loaded = loadAuth();
  const response = await post(loaded, "update-password", {
    password,
    password_confirm: password,
    user_id: "someone-else",
    role: "admin",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).next, "/account?password=updated");
  assert.deepEqual(loaded.calls, [
    ["update-password", { password }],
    ["signout", { scope: "global" }],
  ]);
});
test("same-origin and body limits protect credential endpoints before any provider call", async () => {
  const loaded = loadAuth();
  assert.equal(
    (
      await post(
        loaded,
        "signin",
        { email: "member@example.invalid", password },
        "https://evil.invalid",
      )
    ).status,
    403,
  );
  const response = await loaded.route.POST(
    new Request("https://club.example.invalid/api/auth/signin", {
      method: "POST",
      headers: { origin: "https://club.example.invalid" },
      body: "x".repeat(16_385),
    }),
    { params: Promise.resolve({ action: "signin" }) },
  );
  assert.equal(response.status, 413);
  assert.equal(loaded.calls.length, 0);
  const setup = loadAuth({ configured: false });
  assert.equal(
    (await post(setup, "signin", { email: "member@example.invalid", password }))
      .status,
    503,
  );
});
test("recovery confirmation validates token type, strips the token from redirects and does not require member tables", async () => {
  const loaded = loadAuth({
    who: () => {
      throw new Error("Recovery must not query member tables");
    },
  });
  const success = await loaded.confirm.GET(
    new Request(
      "https://club.example.invalid/auth/confirm?token_hash=test-token&type=recovery&next=https://evil.invalid",
    ),
  );
  assert.equal(
    new URL(success.headers.get("location")).pathname,
    "/reset-password",
  );
  assert.ok(!success.headers.get("location").includes("test-token"));
  assert.equal(success.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(loaded.calls, [
    ["verify", { token_hash: "test-token", type: "recovery" }],
  ]);
  const fail = await loaded.confirm.GET(
    new Request(
      "https://club.example.invalid/auth/confirm?token_hash=test-token&type=invite",
    ),
  );
  assert.ok(fail.headers.get("location").endsWith("/account?error=auth"));
  assert.equal(loaded.calls.length, 1);
});
test("email confirmation and legacy PKCE callbacks preserve approved roles while expired links cannot authenticate", async () => {
  const loaded = loadAuth({
    who: { user: { id: "verified" }, member: { id: "member" }, admin: true },
  });
  const confirmed = await loaded.confirm.GET(
    new Request(
      "https://club.example.invalid/auth/confirm?token_hash=test-token&type=email",
    ),
  );
  assert.ok(confirmed.headers.get("location").endsWith("/admin"));
  const callback = await loaded.callback.GET(
    new Request(
      "https://club.example.invalid/auth/callback?code=test-code&next=https://evil.invalid",
    ),
  );
  assert.ok(callback.headers.get("location").endsWith("/admin"));
  const expired = loadAuth({
    auth: {
      verifyOtp: async () => ({
        data: { user: null },
        error: { code: "otp_expired" },
      }),
    },
  });
  assert.ok(
    (
      await expired.confirm.GET(
        new Request(
          "https://club.example.invalid/auth/confirm?token_hash=expired&type=recovery",
        ),
      )
    ).headers
      .get("location")
      .endsWith("/account?error=auth"),
  );
});
test("legacy login URL opens the own-account login form and never starts Google OAuth", async () => {
  const loaded = loadAuth();
  const response = await loaded.login.GET(
    new Request("https://club.example.invalid/auth/login"),
  );
  assert.ok(response.headers.get("location").endsWith("/account"));
  assert.deepEqual(loaded.calls, []);
});
