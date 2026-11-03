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
  return load("src/app/api/club/[...path]/route.ts");
}
const uid = "22222222-2222-4222-8222-222222222222",
  mid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  eid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const member = { user: { id: uid }, member: { id: mid }, admin: false };
async function get(handler, segments, query = "") {
  return handler.GET(
    new Request("http://localhost/api/club/" + segments.join("/") + query),
    { params: Promise.resolve({ path: segments }) },
  );
}
test("Guest/Member cannot access guest details, operational roster, sharing data or export APIs", async () => {
  const targets = [
    ["admin", "guests"],
    ["admin", "guests", "99999999-9999-4999-8999-999999999999"],
    ["admin", "guests", mid, "history"],
    ["admin", "roster"],
    ["admin", "export"],
    ["admin", "dashboard"],
    ["admin", "attendance-report"],
    ["admin", "dues-summary"],
    ["admin", "member", mid],
    ["admin", "attendance"],
  ];
  for (const who of [{ user: null, member: null, admin: false }, member]) {
    let queried = false;
    const handler = route(who, {
      from() {
        queried = true;
        throw Error("Private query must not run");
      },
    });
    for (const target of targets) {
      const response = await get(
        handler,
        target,
        `?event=${eid}&resource=guests&format=csv`,
      );
      assert.equal(response.status, who.user ? 403 : 401);
      const text = await response.text();
      assert.ok(!text.includes("010"));
    }
    assert.equal(queried, false);
  }
});

test("guest intake normalizes phone, requires four confirmations, saves consent context and returns only this transaction's payment receipt", async () => {
  const vars = [
    "PRIVACY_POLICY_TEXT",
    "PRIVACY_RETENTION_DAYS",
    "PRIVACY_CONTACT",
  ];
  const saved = vars.map((k) => process.env[k]);
  ["실제 운영자 안내", "90", "운영자 연락처"].forEach(
    (v, i) => (process.env[vars[i]] = v),
  );
  try {
    const calls = [];
    const db = {
      from() {
        const q = {
          select() {
            return q;
          },
          eq() {
            return q;
          },
          then(resolve, reject) {
            return Promise.resolve({
              data: [{ is_system: true, required: true, key: "base_name" }],
              error: null,
            }).then(resolve, reject);
          },
        };
        return q;
      },
      async rpc(name, args) {
        calls.push({ name, args });
        return {
          data: {
            receipt: "receipt-only",
            event: { id: eid, title: "Game Day" },
            payment: { amount: 5000, status: "pending" },
            self_reported_paid: true,
          },
          error: null,
        };
      },
    };
    const handler = route({ user: null, member: null, admin: false }, db);
    const input = {
      name: "신청자",
      birth_date: "1998-01-01",
      gender: "여성",
      phone: "+82 10-8181-8181",
      position: "세터",
      experience: "2년",
      source: "지인",
      event_id: eid,
      notice_consent: true,
      rules_consent: true,
      privacy_consent: true,
      photo_consent: true,
      fee_acknowledgement: true,
      self_reported_paid: true,
      rule_versions: {},
      announcement_versions: {},
      question_versions: {},
    };
    for (const field of [
      "notice_consent",
      "rules_consent",
      "privacy_consent",
      "photo_consent",
    ]) {
      assert.equal(
        (
          await write(handler, ["guest-applications"], {
            ...input,
            [field]: false,
          })
        ).status,
        400,
      );
    }
    assert.equal(calls.length, 0);
    const response = await write(handler, ["guest-applications"], input);
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.payment.status, "pending");
    assert.equal(result.self_reported_paid, true);
    assert.equal(result.depositor_name, input.name);
    assert.ok(result.bank.account);
    assert.equal(result.guest_id, undefined);
    assert.equal(calls[0].name, "submit_guest_receipt");
    assert.equal(calls[0].args.p_data.phone, "01081818181");
    assert.equal(
      calls[0].args.p_data.consent_context.privacy_text,
      "실제 운영자 안내",
    );
    assert.deepEqual(calls[0].args.p_data.question_versions, {});
  } finally {
    vars.forEach((k, i) =>
      saved[i] === undefined
        ? delete process.env[k]
        : (process.env[k] = saved[i]),
    );
  }
});

test("question edits use immutable identity and archive custom questions without deleting past definitions", async () => {
  const operations = [];
  let existing = { id: eid, form: "guest", key: "transport", is_system: false };
  const db = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        is() {
          return q;
        },
        update(value) {
          operations.push(value);
          return q;
        },
        single: async () => ({ data: existing, error: null }),
      };
      return q;
    },
  };
  const handler = route({ ...member, admin: true }, db);
  const input = {
    form: "guest",
    key: "transport",
    label: "교통편",
    help_text: "도착 방법",
    type: "select",
    options: ["도보", "차량"],
    required: true,
    active: true,
    sort_order: 1,
  };
  assert.equal(
    (
      await write(
        handler,
        ["admin", "questions", eid],
        { ...input, key: "other" },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(operations.length, 0);
  assert.equal(
    (await write(handler, ["admin", "questions", eid], input, "PATCH")).status,
    200,
  );
  assert.equal(operations[0].key, "transport");
  assert.equal(
    (await write(handler, ["admin", "questions", eid], {}, "DELETE")).status,
    200,
  );
  assert.ok(operations[1].deleted_at);
  assert.equal(operations[1].active, false);
  existing = { ...existing, is_system: true };
  assert.equal(
    (await write(handler, ["admin", "questions", eid], {}, "DELETE")).status,
    400,
  );
  assert.equal(operations.length, 2);
  assert.equal(
    (await write(handler, ["admin", "questions", eid], input, "PATCH")).status,
    200,
  );
  assert.deepEqual(Object.keys(operations[2]).sort(), [
    "help_text",
    "label",
    "sort_order",
  ]);
});
function eventDb() {
  const rpcCalls = [];
  return {
    rpcCalls,
    async rpc(name) {
      rpcCalls.push(name);
      return {
        data:
          name === "event_counts"
            ? {
                members: 18,
                guests: 4,
                total: 22,
                applications: 6,
                pending: 2,
                guest_names: ["SECRET GUEST"],
              }
            : { applications: 6, paid: 4, pending: 2 },
        error: null,
      };
    },
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        neq() {
          return q;
        },
        single: async () => ({
          data: {
            id: eid,
            title: "Game Day",
            starts_at: "2030-10-04T10:00:00Z",
          },
          error: null,
        }),
        maybeSingle: async () => ({ data: { response: "yes" }, error: null }),
        limit: async () => ({ data: [], error: null }),
      };
      return q;
    },
  };
}
test("member event API explicitly projects only aggregate counts, excludes admin summary and applicant details", async () => {
  const db = eventDb();
  const handler = route(member, db);
  const response = await get(handler, ["events", eid]);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.counts, { members: 18, guests: 4, total: 22 });
  assert.equal(Object.hasOwn(data, "guest_summary"), false);
  assert.ok(!JSON.stringify(data).includes("SECRET GUEST"));
  assert.deepEqual(db.rpcCalls, ["event_counts"]);
});
test("admin event API additionally receives scoped 6/4/2 operational totals", async () => {
  const db = eventDb();
  const handler = route({ ...member, admin: true }, db);
  const response = await get(handler, ["events", eid]);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.guest_summary, {
    applications: 6,
    paid: 4,
    pending: 2,
  });
  assert.deepEqual(db.rpcCalls, ["event_counts", "admin_guest_counts"]);
});
test("member notification API rechecks recipient and admin-only policy before returning the inbox", async () => {
  const messages = [
    { id: "safe", user_id: uid, kind: "emergency", href: "/notices" },
    {
      id: "private-kind",
      user_id: uid,
      kind: "guest_application",
      href: "/calendar",
    },
    {
      id: "private-link",
      user_id: uid,
      kind: "general",
      href: "/admin/roster",
    },
    {
      id: "other-user",
      user_id: "someone-else",
      kind: "emergency",
      href: "/notices",
    },
  ];
  const db = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        order() {
          return q;
        },
        limit: async () => ({ data: messages, error: null }),
      };
      return q;
    },
  };
  const response = await get(route(member, db), ["notifications"]);
  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).map((n) => n.id),
    ["safe"],
  );
});

async function write(handler, segments, payload, method = "POST") {
  return handler[method](
    new Request("http://localhost/api/club/" + segments.join("/"), {
      method,
      headers: {
        origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ path: segments }) },
  );
}
test("Guest/Member cannot mutate events/notices or access admin notice revision history", async () => {
  for (const who of [{ user: null, member: null, admin: false }, member]) {
    const handler = route(who, {
      from() {
        throw Error("Unauthorized database mutation");
      },
    });
    for (const target of [
      ["admin", "events"],
      ["admin", "notices"],
      ["admin", "delete"],
    ]) {
      const response = await write(handler, target, {});
      assert.equal(response.status, who.user ? 403 : 401);
    }
    assert.equal(
      (await get(handler, ["admin", "notices", eid, "versions"])).status,
      who.user ? 403 : 401,
    );
  }
});
test("admin API validates schedule times, stores emergency metadata and soft-deletes notices rather than erasing history", async () => {
  const operations = [];
  const db = {
    async rpc() {
      return { data: null, error: null };
    },
    from(table) {
      const q = {
        insert(value) {
          operations.push({ table, method: "insert", value });
          return q;
        },
        update(value) {
          operations.push({ table, method: "update", value });
          return q;
        },
        eq() {
          return q;
        },
        is() {
          return q;
        },
        select() {
          return q;
        },
        single: async () => ({ data: { id: eid }, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: null }).then(
            resolve,
            reject,
          );
        },
        delete() {
          throw Error("History must not be hard-deleted");
        },
      };
      return q;
    },
  };
  const handler = route({ ...member, admin: true }, db);
  const schedule = {
    title: "Lesson",
    starts_at: "2030-01-01T10:00:00Z",
    ends_at: "2030-01-01T13:00:00Z",
    location: "체육관",
    kind: "lesson",
    description: "레슨 안내",
    guests_open: true,
    guest_fee: 15000,
    status: "scheduled",
    is_emergency: true,
    change_reason: "장소 변경",
  };
  assert.equal(
    (
      await write(handler, ["admin", "events"], {
        ...schedule,
        ends_at: schedule.starts_at,
      })
    ).status,
    400,
  );
  assert.equal(operations.length, 0);
  assert.equal(
    (await write(handler, ["admin", "events"], schedule)).status,
    200,
  );
  assert.equal(operations[0].value.is_emergency, true);
  assert.equal(
    (
      await write(
        handler,
        ["admin", "events"],
        { ...schedule, id: eid },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write(handler, ["admin", "notices"], {
        title: "필독",
        content: "안내",
        kind: "required",
        audience: "public",
        starts_at: "2030-01-01T10:00:00Z",
        ends_at: null,
        created_by: "forged",
      })
    ).status,
    200,
  );
  assert.equal(
    operations.find((o) => o.table === "announcements" && o.method === "insert")
      .value.created_by,
    uid,
  );
  assert.equal(
    (
      await write(handler, ["admin", "delete"], {
        resource: "announcements",
        id: eid,
      })
    ).status,
    200,
  );
  assert.ok(
    operations.some(
      (o) =>
        o.table === "announcements" &&
        o.method === "update" &&
        o.value.deleted_at,
    ),
  );
  assert.equal(
    (await write(handler, ["admin", "delete"], { resource: "events", id: eid }))
      .status,
    200,
  );
  assert.ok(
    operations.some(
      (o) =>
        o.table === "events" &&
        o.value.status === "deleted" &&
        o.value.guests_open === false,
    ),
  );
});

test("member request APIs bind to the authenticated member, and review endpoints reject non-admins", async () => {
  const calls = [];
  const db = {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          calls.push({ table, key, value });
          return q;
        },
        order() {
          return q;
        },
        limit: async () => ({ data: [], error: null }),
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: eid, error: null };
    },
  };
  const handler = route(member, db);
  assert.equal(
    (await get(handler, ["name-requests"], "?member=someone-else")).status,
    200,
  );
  assert.ok(calls.some((c) => c.key === "member_id" && c.value === mid));
  assert.equal(
    (
      await write(handler, ["name-requests"], {
        name: "새 이름",
        reason: "정정",
        member_id: eid,
      })
    ).status,
    201,
  );
  assert.deepEqual(calls.find((c) => c.name === "request_member_name").args, {
    p_name: "새 이름",
    p_reason: "정정",
  });
  assert.equal(
    (
      await write(handler, ["admin", "name-requests", "review"], {
        id: eid,
        status: "approved",
      })
    ).status,
    403,
  );
  assert.equal((await get(handler, ["admin", "name-requests"])).status, 403);
  const guest = route({ user: null, member: null, admin: false }, db);
  assert.equal((await get(guest, ["name-requests"])).status, 401);
});

test("photo upload immediately attaches its own object, removes the previous image and cleans up failed attachments", async () => {
  const calls = [];
  let fail = false;
  const old = `${uid}/old.jpg`;
  const db = {
    storage: {
      from() {
        return {
          upload: async (path, bytes, options) => {
            calls.push({ op: "upload", path, options });
            return { data: null, error: null };
          },
          remove: async (paths) => {
            calls.push({ op: "remove", paths });
            return { data: null, error: null };
          },
        };
      },
    },
    async rpc(name, args) {
      calls.push({ op: name, args });
      return {
        data: null,
        error: fail ? new Error("attachment failed") : null,
      };
    },
  };
  const handler = route(
    { ...member, member: { ...member.member, avatar_path: old } },
    db,
  );
  assert.equal(
    (
      await write(handler, ["avatar"], {
        type: "image/jpeg",
        content: Buffer.from("invalid").toString("base64"),
      })
    ).status,
    400,
  );
  assert.equal(calls.length, 0);
  const input = {
    type: "image/jpeg",
    content: Buffer.from([255, 216, 255, 0]).toString("base64"),
    member_id: eid,
  };
  const response = await write(handler, ["avatar"], input);
  assert.equal(response.status, 200);
  const { path } = await response.json();
  assert.ok(path.startsWith(uid + "/"));
  assert.deepEqual(
    calls.map((c) => c.op),
    ["upload", "set_my_avatar", "remove"],
  );
  assert.deepEqual(calls[1].args, { p_path: path });
  assert.deepEqual(calls[2].paths, [old]);
  calls.length = 0;
  fail = true;
  assert.equal((await write(handler, ["avatar"], input)).status, 503);
  assert.deepEqual(
    calls.map((c) => c.op),
    ["upload", "set_my_avatar", "remove"],
  );
  assert.deepEqual(calls[2].paths, [calls[0].path]);
  calls.length = 0;
  fail = false;
  assert.equal((await write(handler, ["avatar"], {}, "DELETE")).status, 200);
  assert.deepEqual(calls[0], { op: "set_my_avatar", args: { p_path: null } });
  assert.deepEqual(calls[1].paths, [old]);
});

test("membership API retains self-reported payment and guest participation answers without activating an account", async () => {
  const vars = [
    "PRIVACY_POLICY_TEXT",
    "PRIVACY_RETENTION_DAYS",
    "PRIVACY_CONTACT",
  ];
  const saved = vars.map((k) => process.env[k]);
  ["운영 안내", "90", "운영자"].forEach((v, i) => (process.env[vars[i]] = v));
  try {
    const calls = [];
    const db = {
      from() {
        const q = {
          select() {
            return q;
          },
          eq() {
            return q;
          },
          then(resolve, reject) {
            return Promise.resolve({ data: [], error: null }).then(
              resolve,
              reject,
            );
          },
        };
        return q;
      },
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: eid, error: null };
      },
    };
    const handler = route(
      { user: { id: uid }, member: null, admin: false },
      db,
    );
    const input = {
      name: "신규회원",
      birth_date: "1999-02-03",
      gender: "여성",
      phone: "010-9090-9090",
      position: "세터",
      experience: "2년",
      source: "지인",
      notes: "질문",
      privacy_consent: true,
      photo_consent: true,
      rules_consent: true,
      self_reported_paid: true,
      fee_acknowledgement: true,
      rule_versions: {},
      current_month_guest_participated: true,
      current_month_guest: "10월 1일 1회",
    };
    assert.equal(
      (
        await write(handler, ["membership"], {
          ...input,
          current_month_guest: "",
        })
      ).status,
      400,
    );
    assert.equal((await write(handler, ["membership"], input)).status, 201);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "submit_membership");
    const answer = calls[0].args.p_data;
    assert.equal(answer.phone, "01090909090");
    assert.equal(answer.current_month_guest_participated, true);
    assert.equal(answer.self_reported_paid, true);
    assert.ok(answer.consent_context.privacy_text);
    assert.equal(answer.status, undefined);
  } finally {
    vars.forEach((k, i) =>
      saved[i] === undefined
        ? delete process.env[k]
        : (process.env[k] = saved[i]),
    );
  }
});

test("real RSVP and report routes accept all three responses, bind own reports and validate query ranges", async () => {
  const calls = [];
  const db = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { summary: {}, rows: [], total: 0 }, error: null };
    },
  };
  const handler = route(member, db);
  for (const response of ["yes", "no", "unanswered"])
    assert.equal(
      (
        await write(handler, ["rsvp"], {
          event_id: eid,
          response,
          member_id: eid,
        })
      ).status,
      200,
    );
  assert.deepEqual(
    calls.slice(0, 3).map((c) => c.args.p_response),
    ["yes", "no", "unanswered"],
  );
  assert.ok(
    calls
      .slice(0, 3)
      .every(
        (c) => Object.keys(c.args).sort().join(",") === "p_event,p_response",
      ),
  );
  assert.equal(
    (await get(handler, ["my-attendance"], `?year=2025&page=2&member=${eid}`))
      .status,
    200,
  );
  assert.deepEqual(calls[3], {
    name: "my_attendance_report",
    args: { p_year: 2025, p_page: 2 },
  });
  assert.equal(
    (await get(handler, ["my-attendance"], "?year=bad")).status,
    400,
  );
  assert.equal((await get(handler, ["my-attendance"], "?page=-1")).status, 400);
  const adminHandler = route({ ...member, admin: true }, db);
  assert.equal(
    (
      await get(
        adminHandler,
        ["admin", "attendance-report"],
        `?year=2025&member=${mid}`,
      )
    ).status,
    200,
  );
  assert.deepEqual(calls.at(-1).args, {
    p_member: mid,
    p_year: 2025,
    p_page: 0,
  });
  assert.equal(
    (
      await get(
        adminHandler,
        ["admin", "attendance"],
        `?event=${eid}&response=unanswered&page=1`,
      )
    ).status,
    200,
  );
  assert.equal(calls.at(-1).name, "admin_event_attendance");
});

test("admin member details use exact DB summary, and dashboard event scope is forwarded without a service role", async () => {
  const calls = [];
  const db = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        single: async () => ({
          data: {
            id: mid,
            name: "회원",
            avatar_path: null,
            member_notes: { admin_memo: "운영 메모" },
          },
          error: null,
        }),
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: {
          year_attendance: 507,
          attendance_count: 700,
          last_attended: "2026-10-04T10:00:00Z",
          current_month_payment: { status: "unpaid" },
        },
        error: null,
      };
    },
  };
  const handler = route({ ...member, admin: true }, db);
  const result = await get(handler, ["admin", "member", mid]);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.year_attendance, 507);
  assert.equal(data.current_month_payment.status, "unpaid");
  assert.equal(data.member_notes.admin_memo, "운영 메모");
  assert.equal(calls[0].name, "admin_member_summary");
  assert.equal(
    (await get(handler, ["admin", "dashboard"], `?event=${eid}`)).status,
    200,
  );
  assert.deepEqual(calls.at(-1), {
    name: "admin_dashboard",
    args: { p_event: eid },
  });
});

test("dues APIs apply month/member/status filters, validate states and stamp the verified administrator", async () => {
  const operations = [];
  const db = {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          operations.push({ key, value });
          return q;
        },
        order() {
          return q;
        },
        limit: async () => ({ data: [], error: null }),
        upsert: async (value) => {
          operations.push({ table, value });
          return { data: null, error: null };
        },
      };
      return q;
    },
    async rpc(name, args) {
      operations.push({ name, args });
      return {
        data: { paid: 1, unpaid: 2, exempt: 1, unregistered: 0 },
        error: null,
      };
    },
  };
  const handler = route({ ...member, admin: true }, db);
  assert.equal(
    (
      await get(
        handler,
        ["admin", "dues"],
        `?month=2026-10&status=unpaid&member=${mid}`,
      )
    ).status,
    200,
  );
  assert.ok(
    operations.some((o) => o.key === "month" && o.value === "2026-10-01"),
  );
  assert.ok(operations.some((o) => o.key === "status" && o.value === "unpaid"));
  assert.equal(
    (await get(handler, ["admin", "dues-summary"], "?month=2026-13")).status,
    400,
  );
  for (const status of ["paid", "unpaid", "exempt"])
    assert.equal(
      (
        await write(handler, ["admin", "dues"], {
          member_id: mid,
          month: "2026-10-01",
          amount: 60000,
          status,
          verified_by: "forged",
        })
      ).status,
      200,
    );
  assert.ok(
    operations
      .filter((o) => o.table === "membership_payments")
      .every((o) => o.value.verified_by === uid),
  );
  assert.equal(
    (
      await write(handler, ["admin", "dues"], {
        member_id: mid,
        month: "2026-10-01",
        amount: 60000,
        status: "pending",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(route(member, db), ["admin", "dues"], {
        member_id: mid,
        month: "2026-10-01",
        amount: 0,
        status: "paid",
      })
    ).status,
    403,
  );
});

test("video feed and video/playlist details reject guests and unapproved accounts before any query", async () => {
  for (const who of [
    { user: null, member: null, admin: false },
    { user: { id: uid }, member: null, admin: false },
  ]) {
    const handler = route(who, {
      from() {
        throw Error("Must not query archive");
      },
    });
    for (const target of [["videos"], ["videos", eid], ["playlists", eid]]) {
      assert.equal((await get(handler, target)).status, who.user ? 403 : 401);
    }
  }
});

test("admin roster API reprojects RPC rows and never returns private fields in share payload", async () => {
  const handler = route(
    { ...member, admin: true },
    {
      async rpc(name, args) {
        assert.equal(name, "admin_roster");
        assert.equal(args.p_event, eid);
        return {
          data: {
            event: {
              id: eid,
              title: "Game Day",
              starts_at: "2026-10-04T09:00:00+09:00",
              kind: "game",
            },
            members: [
              {
                name: "회원",
                position: "센터",
                phone: "01099999999",
                admin_memo: "비공개",
              },
            ],
            guests: [
              { name: "게스트", position: "세터", birth_date: "1990-01-01" },
            ],
          },
          error: null,
        };
      },
    },
  );
  const response = await get(handler, ["admin", "roster"], `?event=${eid}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.counts, { members: 1, guests: 1, total: 2 });
  assert.deepEqual(data.members, [{ name: "회원", position: "센터" }]);
  assert.deepEqual(data.guests, [{ name: "게스트", position: "세터" }]);
  assert.ok(!JSON.stringify(data).includes("010999"));
  assert.ok(!JSON.stringify(data).includes("비공개"));
});

test("admin archive writes preserve source tables and normalize private playlist metadata, rejecting invalid URLs before writing", async () => {
  const calls = [];
  const db = {
    from(table) {
      const q = {
        insert: async (data) => {
          calls.push({ table, data });
          return { data: null, error: null };
        },
        update(data) {
          calls.push({ table, data });
          return q;
        },
        eq(column, value) {
          calls.push({ column, value });
          return q;
        },
        select() {
          return q;
        },
        single: async () => ({ data: { id: eid }, error: null }),
      };
      return q;
    },
  };
  const handler = route({ ...member, admin: true }, db);
  const input = {
    id: eid,
    title: "10월 경기",
    description: "경기 모음",
    url: "https://youtube.com/playlist?list=PLabcdefghijk",
    filmed_on: "2026-10-04",
    kind: "game",
    event_id: eid,
    video_count: 12,
    visibility: "public",
    cover_video_url: "https://youtu.be/abcdefghijk",
    created_by: "forged",
  };
  assert.equal(
    (await write(handler, ["admin", "playlists"], input)).status,
    200,
  );
  assert.equal(calls[0].table, "video_playlists");
  assert.equal(calls[0].data.visibility, "member");
  assert.equal(calls[0].data.created_by, uid);
  assert.equal(calls[0].data.video_count, 12);
  assert.equal(
    calls[0].data.thumbnail,
    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  );
  assert.ok(!Object.hasOwn(calls[0].data, "video_id"));
  calls.length = 0;
  assert.equal(
    (
      await write(
        handler,
        ["admin", "videos"],
        { ...input, url: "https://youtu.be/abcdefghijk" },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(calls[0].table, "videos");
  assert.equal(calls[0].data.video_id, "abcdefghijk");
  assert.ok(!Object.hasOwn(calls[0].data, "created_by"));
  calls.length = 0;
  assert.equal(
    (
      await write(handler, ["admin", "playlists"], {
        ...input,
        url: "https://evil.invalid/playlist?list=PLabcdefghijk",
      })
    ).status,
    400,
  );
  assert.deepEqual(calls, []);
  assert.equal(
    (await write(route(member, db), ["admin", "playlists"], input)).status,
    403,
  );
  assert.deepEqual(calls, []);
});

test("admin Export preserves month plus payment filter and unions later-row columns", async () => {
  const calls = [];
  const q = {};
  for (const key of ["select", "order", "gte", "lte", "eq", "ilike", "is"])
    q[key] = (...args) => {
      calls.push([key, ...args]);
      return q;
    };
  q.range = async () => ({
    error: null,
    data: [
      { id: "one", answers: { source: "Instagram" } },
      { id: "two", answers: { experience: "2 years", source: "=danger" } },
    ],
  });
  const handler = route({ ...member, admin: true }, { from: () => q });
  const result = await get(
    handler,
    ["admin", "export"],
    "?resource=guests&format=csv&month=2026-10&status=paid",
  );
  assert.equal(result.status, 200);
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "eq" && c[1] === "guest_payments.status" && c[2] === "paid",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "gte" &&
        c[1] === "submitted_at" &&
        c[2] === "2026-10-01T00:00:00+09:00",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "lte" &&
        c[1] === "submitted_at" &&
        c[2] === "2026-10-31T23:59:59+09:00",
    ),
  );
  const text = await result.text();
  assert.ok(text.includes("answers.experience"));
  assert.ok(text.includes("2 years"));
  assert.ok(text.includes("'=danger"));
});
