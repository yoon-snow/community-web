const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function route(who, db) {
  const cache = new Map();
  const dependencies = {
    "next/server": { after() {} },
    "@/lib/supabase/server": {
      serverClient: async () => db,
      serviceClient: () => db,
      configured: () => true,
      identity: async () => who,
      HttpError,
    },
    "@/lib/push": {
      deliverPush: async () => ({ sent: 0 }),
      isPushEndpoint: () => true,
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const module = { exports: {} };
    new Function("exports", "require", "module", code)(
      module.exports,
      (n) =>
        Object.hasOwn(dependencies, n)
          ? dependencies[n]
          : n.startsWith("@/")
            ? load("src/" + n.slice(2) + ".ts")
            : n.startsWith(".")
              ? load(path.resolve(path.dirname(file), n + ".ts"))
              : require(n),
      module,
    );
    cache.set(file, module.exports);
    return module.exports;
  }
  return load("src/app/api/support/[...path]/route.ts");
}

test("guest links require matching token and ticket, and cannot reach admin or member inboxes", async () => {
  const { createHash } = require("node:crypto"),
    id = "55555555-5555-4555-8555-555555555555";
  const token = "x".repeat(43),
    hash = createHash("sha256").update(token).digest("hex");
  const guestRow = {
    id,
    member_id: null,
    guest_token_hash: hash,
    title: "비공개 문의",
  };
  const db = {
    from(table) {
      let valid = true;
      const query = {
        select() {
          return query;
        },
        eq(k, v) {
          if (table === "inquiries") valid = valid && guestRow[k] === v;
          return query;
        },
        is(k, v) {
          return query.eq(k, v);
        },
        maybeSingle() {
          return {
            data: valid ? { title: guestRow.title, member_id: null } : null,
            error: null,
          };
        },
        order() {
          return { data: [], error: null };
        },
      };
      return query;
    },
  };
  async function call(path, key, member) {
    const headers = key ? { "x-inquiry-token": key } : {};
    const r = await route({ member, admin: false }, db).GET(
      new Request("https://club.example/api/support/" + path, { headers }),
      { params: Promise.resolve({ path: path.split("/") }) },
    );
    return r.status;
  }
  assert.equal(await call(id, token, null), 200);
  assert.equal(await call(id, "y".repeat(43), null), 404);
  assert.equal(await call(id, null, null), 404);
  assert.equal(
    await call("65555555-5555-4555-8555-555555555555", token, null),
    404,
  );
  assert.equal(await call(id, null, { id: "another-member" }), 404);
  assert.equal(await call("admin/" + id, token, null), 403);
  assert.equal(await call("mine", token, null), 401);
});

test("receipt lookup matches submission phone and returns only the receipt summary", async () => {
  const id="55555555-5555-4555-8555-555555555555";
  const row={id,answers:{name:"비공개",phone:"01012345678"},self_reported_paid:true,events:{title:"게임데이"},guest_payments:[{status:"pending",amount:5000}]};
  const db={rpc:async()=>({data:true}),from:()=>({select:()=>({eq:(_,value)=>({maybeSingle:async()=>({data:value===id?row:null})})})})};
  const handler=route({},db);
  const call=(phone)=>handler.POST(new Request("https://club.example/api/support/receipt",{method:"POST",headers:{Origin:"https://club.example","Content-Type":"application/json"},body:JSON.stringify({id,phone})}),{params:Promise.resolve({path:["receipt"]})});
  assert.equal((await call("01011112222")).status,404);
  const response=await call("010-1234-5678");
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.payment.status,"pending");
  assert.equal(result.self_reported_paid,true);
  assert.ok(!("answers" in result));
});
