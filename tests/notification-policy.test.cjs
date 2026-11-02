const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { readFileSync } = require("node:fs");
function load(file, dependencies = {}, env = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", "module", "process", code)(
    module.exports,
    (n) => (Object.hasOwn(dependencies, n) ? dependencies[n] : require(n)),
    module,
    { env },
  );
  return module.exports;
}
const policy = load("src/lib/notification-policy.ts");
test("notification policy protects operations by kind and link while retaining ordinary member emergency notices", () => {
  const targets = [
    { kind: "admin_application", href: "/calendar" },
    { kind: "guest_application", href: "/calendar" },
    { kind: "guest_payment", href: "/calendar" },
    { kind: "admin_roster", href: "/calendar" },
    { kind: "participant_list", href: "/calendar" },
    { kind: "general", href: "/admin/roster?event=x" },
    { kind: "general", href: "/admin?tab=guests" },
  ];
  for (const n of targets) {
    assert.equal(policy.canReceiveNotification("member", n), false);
    assert.equal(policy.canReceiveNotification("guest", n), false);
    assert.equal(policy.canReceiveNotification("admin", n), true);
  }
  assert.equal(
    policy.canReceiveNotification("member", {
      kind: "emergency",
      href: "/notices",
    }),
    true,
  );
  assert.equal(
    policy.canReceiveNotification("member", {
      kind: "general",
      href: "/administration-guide",
    }),
    true,
  );
});
test("Web Push delivery suppresses historical member operations and demoted/inactive recipients before sending", async () => {
  const messages = [
    {
      id: "n1",
      user_id: "member",
      kind: "admin_application",
      href: "/admin/guests",
    },
    {
      id: "n2",
      user_id: "member",
      kind: "guest_application",
      href: "/calendar",
    },
    { id: "n3", user_id: "member", kind: "general", href: "/admin/roster" },
    { id: "n4", user_id: "admin", kind: "admin_roster", href: "/admin/roster" },
    { id: "n5", user_id: "member", kind: "emergency", href: "/notices" },
    {
      id: "n6",
      user_id: "inactive",
      kind: "admin_roster",
      href: "/admin/roster",
    },
    { id: "n7", user_id: "member", kind: "general", href: "/" },
    { id: "n8", user_id: "member", kind: "admin_roster", href: "/calendar" },
  ];
  const sends = [],
    updates = [];
  const db = {
    rpc: async () => ({
      data: messages.map((n) => ({
        id: "job-" + n.id,
        notification_id: n.id,
        attempts: 1,
      })),
      error: null,
    }),
    from(table) {
      const filters = {};
      let update;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters[k] = v;
          return q;
        },
        update(v) {
          update = v;
          return q;
        },
        single() {
          return Promise.resolve({
            data: messages.find((n) => n.id === filters.id),
            error: null,
          });
        },
        maybeSingle() {
          if (table === "members")
            return Promise.resolve({
              data:
                filters.user_id === "inactive"
                  ? null
                  : { id: filters.user_id, status: "active" },
              error: null,
            });
          if (table === "admins")
            return Promise.resolve({
              data:
                filters.member_id === "admin" ? { member_id: "admin" } : null,
              error: null,
            });
          throw Error("Unexpected query " + table);
        },
        then(resolve, reject) {
          let result;
          if (update) {
            updates.push({ id: filters.id, ...update });
            result = { data: null, error: null };
          } else if (table === "push_subscriptions")
            result = {
              data: [
                {
                  id: "s-" + filters.user_id,
                  endpoint:
                    "https://fcm.googleapis.com/send/" + filters.user_id,
                  p256dh: "test",
                  auth: "test",
                },
              ],
              error: null,
            };
          else throw Error("Unexpected query " + table);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const push = load(
    "src/lib/push.ts",
    {
      "server-only": {},
      "web-push": {
        default: {
          setVapidDetails() {},
          async sendNotification(subscription, payload) {
            sends.push(JSON.parse(payload));
          },
        },
      },
      "./supabase/server": { serviceClient: () => db },
      "./notification-policy": policy,
    },
    {
      VAPID_PUBLIC_KEY: "test",
      VAPID_PRIVATE_KEY: "test",
      VAPID_SUBJECT: "mailto:test@example.invalid",
    },
  );
  const result = await push.deliverPush();
  assert.equal(result.sent, 3);
  assert.deepEqual(
    sends.map((n) => n.id),
    ["n4", "n5", "n7"],
  );
  for (const id of ["n1", "n2", "n3", "n6", "n8"])
    assert.ok(
      updates.some(
        (u) =>
          u.id === "job-" + id &&
          u.last_error === "recipient no longer eligible",
      ),
    );
});
