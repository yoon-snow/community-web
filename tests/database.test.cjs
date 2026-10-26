const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

// Exercise the real modules with isolated globals and driver doubles; no Atlas needed.
function loadModule(file, dependencies, env = {}) {
  const source = readFileSync(resolve(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    process: { env },
    Response,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

test("concurrent requests share the same connection and reuse it after connecting", async () => {
  let created = 0;
  let connectCalls = 0;
  let finish;
  class MongoClient {
    constructor() { created++; }
    connect() {
      connectCalls++;
      return new Promise((resolve) => { finish = () => resolve(this); });
    }
  }
  const { getMongoClient } = loadModule("src/lib/mongodb.ts", {
    "server-only": {}, mongodb: { MongoClient },
  }, { MONGODB_URI: "mongodb://example.invalid/community" });
  const first = getMongoClient();
  assert.equal(first, getMongoClient());
  finish();
  assert.equal(await first, await getMongoClient());
  assert.equal(created, 1);
  assert.equal(connectCalls, 1);
});

test("failed initial connection is closed and a later request retries", async () => {
  let created = 0;
  let closed = 0;
  class MongoClient {
    constructor() { this.id = ++created; }
    connect() { return this.id === 1 ? Promise.reject(new Error("private driver details")) : Promise.resolve(this); }
    async close() { closed++; }
  }
  const { getMongoClient } = loadModule("src/lib/mongodb.ts", {
    "server-only": {}, mongodb: { MongoClient },
  }, { MONGODB_URI: "mongodb://example.invalid/community" });
  await assert.rejects(getMongoClient());
  await getMongoClient();
  assert.equal(created, 2);
  assert.equal(closed, 1);
});

test("missing URI is checked lazily without constructing a client", () => {
  const { getMongoClient } = loadModule("src/lib/mongodb.ts", {
    "server-only": {}, mongodb: { MongoClient: class { constructor() { assert.fail("should not connect"); } } },
  });
  assert.throws(() => getMongoClient(), /MONGODB_URI is not configured/);
});

test("health API pings the DB and returns only an uncached success flag", async () => {
  let pinged = false;
  const { GET, runtime, dynamic } = loadModule("src/app/api/health/db/route.ts", {
    "@/lib/mongodb": {
      getMongoClient: async () => ({ db: () => ({ command: async (command, options) => {
        assert.equal(command.ping, 1);
        assert.equal(options.timeoutMS, 5000);
        pinged = true;
        return { ok: 1, privateDetails: "must not be returned" };
      } }) }),
    },
  });
  const response = await GET();
  assert.equal(pinged, true);
  assert.equal(runtime, "nodejs");
  assert.equal(dynamic, "force-dynamic");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
});

test("health API hides both connection and ping errors", async () => {
  for (const getMongoClient of [
    () => { throw new Error("mongodb://secret-user:password@private-host/community"); },
    async () => ({ db: () => ({ command: async () => { throw new Error("private ping details"); } }) }),
  ]) {
    const { GET } = loadModule("src/app/api/health/db/route.ts", {
      "@/lib/mongodb": { getMongoClient },
    });
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false });
  }
});
