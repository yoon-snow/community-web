const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
let db;
const admin = "11111111-1111-4111-8111-111111111111",
  member = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333",
  pending = "44444444-4444-4444-8444-444444444444";
const mid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  aid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  oid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const event = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  past = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const guest = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  application = "99999999-9999-4999-8999-999999999999";
before(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant all on storage.objects to authenticated;grant usage on schema storage to authenticated;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  for (const file of readdirSync("supabase/migrations").sort()) {
    const sql = readFileSync("supabase/migrations/" + file, "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    );
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${file}: ${e.message}`);
    }
  }
  await db.exec(
    `insert into auth.users values('${admin}','admin@example.invalid'),('${member}','member@example.invalid'),('${other}','other@example.invalid'),('${pending}','pending@example.invalid');insert into public.members(id,user_id,name,phone) values('${aid}','${admin}','운영진','01011111111'),('${mid}','${member}','회원','01022222222'),('${oid}','${other}','다른회원','01033333333');insert into public.admins(member_id) values('${aid}');insert into public.member_notes values('${mid}','절대 공개하지 않는 메모');insert into public.events(id,title,starts_at,ends_at,location,kind,guests_open) values('${event}','미래 운동',now()+interval '2 days',now()+interval '2 days 3 hours','체육관','game',true),('${past}','지난 운동',now()-interval '3 days',now()-interval '2 days','체육관','lesson',false);insert into public.guests(id,name,phone,position) values('${guest}','개인게스트','01044444444','세터');insert into public.guest_applications(id,guest_id,event_id,answers,self_reported_paid) values('${application}','${guest}','${event}','{}',true);insert into public.guest_payments(application_id,amount) values('${application}',5000);insert into public.membership_payments(member_id,month,status) values('${mid}',date_trunc('month',now())::date,'unpaid'),('${oid}',date_trunc('month',now())::date,'paid');insert into public.announcements(title,content,kind,audience) values('공개','공개','general','public'),('회원공지','비공개','general','member'),('운영공지','비공개','general','admin');insert into public.videos(title,url,video_id,filmed_on) values('회원영상','https://youtube.com/watch?v=abcdefghijk','abcdefghijk',current_date);insert into public.rules(category,title) values('guest','게스트 회칙');insert into public.rule_versions(rule_id,version,content,published) select id,1,'회칙',true from public.rules;`,
  );
});
after(async () => {
  if (db) await db.close();
});
async function currentGuestInput(overrides = {}) {
  const rules = (
    await db.query(
      "select r.id,r.current_version from public.rules r join public.rule_versions v on v.rule_id=r.id and v.version=r.current_version where v.published",
    )
  ).rows;
  const notices = (
    await as(
      "anon",
      null,
      "select id,version from public.announcements where kind in ('required','emergency')",
    )
  ).rows;
  const questions = (
    await as(
      "anon",
      null,
      "select id,version from public.form_questions where form='guest'",
    )
  ).rows;
  return {
    name: "재방문 테스트",
    phone: "01081818181",
    birth_date: "1998-01-01",
    gender: "여성",
    position: "세터",
    experience: "2년",
    source: "지인",
    event_id: event,
    notice_consent: true,
    privacy_consent: true,
    photo_consent: true,
    rules_consent: true,
    fee_acknowledgement: true,
    self_reported_paid: true,
    rule_versions: Object.fromEntries(
      rules.map((r) => [r.id, r.current_version]),
    ),
    announcement_versions: Object.fromEntries(
      notices.map((n) => [n.id, n.version]),
    ),
    question_versions: Object.fromEntries(
      questions.map((q) => [q.id, q.version]),
    ),
    extra_answers: {},
    ...overrides,
  };
}
async function as(role, user, sql, params = []) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user || "",
    ]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const memberQuery = (sql, params = []) =>
  as("authenticated", member, sql, params);
const adminQuery = (sql, params = []) =>
  as("authenticated", admin, sql, params);
test("all club tables have RLS enabled", async () => {
  const r = await db.query(
    "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
  );
  assert.deepEqual(r.rows, []);
});
test("anonymous can read public events and notices but not personal tables, export backing data or videos", async () => {
  assert.equal(
    (await as("anon", null, "select * from public.events")).rows.length,
    2,
  );
  assert.equal(
    (await as("anon", null, "select * from public.announcements")).rows.length,
    1,
  );
  assert.equal(
    (await as("anon", null, "select * from public.videos")).rows.length,
    0,
  );
  for (const table of [
    "members",
    "guests",
    "guest_applications",
    "guest_payments",
    "membership_payments",
    "import_batches",
  ])
    await assert.rejects(as("anon", null, `select * from public.${table}`));
  await assert.rejects(
    as("anon", null, `select public.event_counts('${event}')`),
  );
});
test("member reads own sensitive profile/dues but cannot see other members, guest identities or admin notes", async () => {
  assert.deepEqual((await memberQuery("select id from public.members")).rows, [
    { id: mid },
  ]);
  assert.equal(
    (await memberQuery("select * from public.membership_payments")).rows.length,
    1,
  );
  assert.equal(
    (await memberQuery("select * from public.member_notes")).rows.length,
    0,
  );
  for (const t of ["guests", "guest_applications", "guest_payments", "admins"])
    assert.equal(
      (await memberQuery(`select * from public.${t}`)).rows.length,
      0,
    );
  assert.equal(
    (await memberQuery("select * from public.videos")).rows.length,
    1,
  );
  assert.equal(
    (await memberQuery("select * from public.announcements")).rows.length,
    2,
  );
});
test("pending authenticated user does not receive membership automatically", async () => {
  assert.equal(
    (await as("authenticated", pending, "select * from public.members")).rows
      .length,
    0,
  );
  assert.equal(
    (await as("authenticated", pending, "select * from public.videos")).rows
      .length,
    0,
  );
  await assert.rejects(
    as(
      "authenticated",
      pending,
      `select public.respond_event('${event}','yes')`,
    ),
  );
});
test("member cannot self-promote, approve membership, verify payment or write actual attendance", async () => {
  await assert.rejects(
    memberQuery(`insert into public.admins(member_id) values('${mid}')`),
  );
  assert.equal(
    (
      await memberQuery(
        `update public.members set status='withdrawn' where id='${mid}' returning id`,
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    memberQuery(`select public.confirm_guest_payment('${application}')`),
  );
  await assert.rejects(
    memberQuery(`select public.check_attendance('${past}','${mid}',true)`),
  );
  await assert.rejects(
    memberQuery("select public.preview_import('members','[]','digest')"),
  );
  await assert.rejects(memberQuery("select public.claim_push_jobs()"));
});
test("member RSVP is isolated from actual attendance and preserves member identity after rename", async () => {
  await memberQuery(`select public.respond_event('${event}','yes')`);
  let r = await memberQuery(
    `select * from public.event_attendance where event_id='${event}'`,
  );
  assert.equal(r.rows[0].actual, null);
  await assert.rejects(
    memberQuery("select public.update_my_profile($1::jsonb)", [
      JSON.stringify({
        name: "이름변경",
        phone: "01022222222",
        position: "센터",
        experience: "2년",
        avatar_path: null,
      }),
    ]),
    /name approval required/,
  );
  const request = (
    await memberQuery(
      "select public.request_member_name('이름변경','변경 요청') as id",
    )
  ).rows[0].id;
  await adminQuery(
    "select public.review_member_name($1,'approved','확인 완료')",
    [request],
  );
  r = await memberQuery(
    `select * from public.event_attendance where event_id='${event}'`,
  );
  assert.equal(r.rows[0].member_id, mid);
  assert.equal(r.rows[0].response, "yes");
  await assert.rejects(
    memberQuery(`select public.respond_event('${past}','yes')`),
  );
});
test("guest counts exclude self-reported payment until admin verification", async () => {
  let r = await memberQuery(`select public.event_counts('${event}') as counts`);
  assert.equal(r.rows[0].counts.guests, 0);
  assert.equal(r.rows[0].counts.members, 1);
  await adminQuery(`select public.confirm_guest_payment('${application}')`);
  r = await memberQuery(`select public.event_counts('${event}') as counts`);
  assert.equal(r.rows[0].counts.guests, 1);
  assert.equal(r.rows[0].counts.total, 2);
  assert.equal(
    (await memberQuery("select * from public.guests")).rows.length,
    0,
  );
});
test("admin can access all operational data and check actual attendance only after event end", async () => {
  assert.equal(
    (await adminQuery("select * from public.members")).rows.length,
    3,
  );
  assert.equal(
    (await adminQuery("select * from public.guests")).rows.length,
    1,
  );
  await adminQuery(`select public.check_attendance('${past}','${mid}',true)`);
  assert.equal(
    (
      await memberQuery(
        `select actual from public.event_attendance where event_id='${past}'`,
      )
    ).rows[0].actual,
    true,
  );
  await assert.rejects(
    adminQuery(`select public.check_attendance('${event}','${mid}',true)`),
  );
});
test("guest application notifications go only to admins; no data is sent to ordinary members", async () => {
  const all = await db.query(
    "select user_id,kind from public.notifications where kind='admin_application'",
  );
  assert.ok(all.rows.length);
  assert.ok(all.rows.every((r) => r.user_id === admin));
  assert.equal(
    (
      await memberQuery(
        "select * from public.notifications where kind='admin_application'",
      )
    ).rows.length,
    0,
  );
});
test("service-role guest submission deduplicates by normalized phone and cannot overwrite existing guest name", async () => {
  const rules = (await db.query("select id,current_version from public.rules"))
    .rows;
  const versions = Object.fromEntries(
    rules.map((r) => [r.id, r.current_version]),
  );
  const input = {
    name: "새이름",
    phone: "01044444444",
    position: "센터",
    event_id: past,
    privacy_consent: true,
    photo_consent: true,
    rules_consent: true,
    rule_versions: versions,
  };
  await assert.rejects(
    as("service_role", null, "select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify(input),
      "key1",
    ]),
  );
  input.event_id = event;
  await assert.rejects(
    as("service_role", null, "select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify(input),
      "key1",
    ]),
  );
  assert.equal(
    (await db.query(`select name from public.guests where id='${guest}'`))
      .rows[0].name,
    "개인게스트",
  );
  await assert.rejects(
    memberQuery("select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify(input),
      "key1",
    ]),
  );
});
test("membership is pending until admin approves, role cannot be forged in answers", async () => {
  const rules = (await db.query("select id,current_version from public.rules"))
    .rows;
  const a = {
    name: "신규",
    phone: "01055555555",
    birth_date: "1998-01-01",
    gender: "여성",
    position: "세터",
    experience: "1년",
    privacy_consent: true,
    photo_consent: true,
    rules_consent: true,
    role: "admin",
    rule_versions: Object.fromEntries(
      rules.map((r) => [r.id, r.current_version]),
    ),
  };
  const r = await as(
    "authenticated",
    pending,
    "select public.submit_membership($1::jsonb) as id",
    [JSON.stringify(a)],
  );
  assert.equal(
    (await as("authenticated", pending, "select * from public.members")).rows
      .length,
    0,
  );
  await assert.rejects(
    as(
      "authenticated",
      pending,
      "select public.review_membership($1,$2,null)",
      [r.rows[0].id, "approved"],
    ),
  );
  await adminQuery("select public.review_membership($1,$2,null)", [
    r.rows[0].id,
    "approved",
  ]);
  assert.equal(
    (await as("authenticated", pending, "select * from public.members")).rows
      .length,
    1,
  );
  assert.equal(
    (await as("authenticated", pending, "select * from public.admins")).rows
      .length,
    0,
  );
});
test("emergency notifications respect audience, do not send drafts, are idempotent", async () => {
  await db.exec(
    "insert into public.announcements(title,content,kind,audience) values('긴급','test','emergency','member'),('운영진 긴급','test','emergency','admin');insert into public.announcements(title,content,kind,audience,starts_at) values('미래 긴급','test','emergency','member',now()+interval '1 day');",
  );
  await adminQuery("select public.publish_emergencies()");
  await adminQuery("select public.publish_emergencies()");
  const n = await memberQuery(
    "select * from public.notifications where kind='emergency'",
  );
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].title, "긴급");
});
test("immutable import preview, admin ownership, idempotency and transaction rollback", async () => {
  const rows = [
    {
      external_id: "test-import-1",
      name: "수입회원",
      phone: "01066666666",
      joined_on: "2025-01-01",
      position: "세터",
      experience: "1년",
      status: "active",
    },
  ];
  const r = await adminQuery(
    "select public.preview_import($1,$2::jsonb,$3) as preview",
    ["members", JSON.stringify(rows), "digest"],
  );
  const p = r.rows[0].preview;
  assert.equal(p.new, 1);
  await assert.rejects(
    memberQuery("select public.commit_import($1,$2)", [p.batch_id, "digest"]),
  );
  await assert.rejects(
    adminQuery("select public.commit_import($1,$2)", [p.batch_id, "tampered"]),
  );
  await adminQuery("select public.commit_import($1,$2)", [
    p.batch_id,
    "digest",
  ]);
  await adminQuery("select public.commit_import($1,$2)", [
    p.batch_id,
    "digest",
  ]);
  assert.equal(
    (await db.query("select * from public.members where phone='01066666666'"))
      .rows.length,
    1,
  );
  const broken = [
    { ...rows[0], phone: "01077777777", external_id: "rollback-1" },
    {
      ...rows[0],
      phone: "01088888888",
      external_id: "rollback-2",
      status: "invalid",
    },
  ];
  const x = await adminQuery(
    "select public.preview_import($1,$2::jsonb,$3) as p",
    ["members", JSON.stringify(broken), "broken"],
  );
  await assert.rejects(
    adminQuery("select public.commit_import($1,$2)", [
      x.rows[0].p.batch_id,
      "broken",
    ]),
  );
  assert.equal(
    (await db.query("select * from public.members where phone='01077777777'"))
      .rows.length,
    0,
  );
});
test("13:00 roster notifications are admin-only and repeated scheduler execution does not duplicate", async () => {
  await db.exec(
    `insert into public.events(title,starts_at,ends_at,location,kind) values('오늘 운동',now(),now()+interval '3 hours','체육관','game');`,
  );
  await as("service_role", null, "select public.daily_notifications()");
  await as("service_role", null, "select public.daily_notifications()");
  const n = await db.query(
    "select user_id,dedupe_key from public.notifications where kind='admin_roster'",
  );
  assert.ok(n.rows.every((r) => r.user_id === admin));
  assert.equal(new Set(n.rows.map((r) => r.dedupe_key)).size, n.rows.length);
  const kstHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (kstHour >= 13) assert.equal(n.rows.length, 1);
  else assert.equal(n.rows.length, 0);
});

test("successful guest submission returns only an ID, saves version consent, and creates a separate unverified payment", async () => {
  const r = (await db.query("select id,current_version from public.rules"))
    .rows;
  const input = {
    name: "새게스트",
    phone: "01090909090",
    position: "세터",
    event_id: event,
    privacy_consent: true,
    photo_consent: true,
    rules_consent: true,
    self_reported_paid: true,
    rule_versions: Object.fromEntries(r.map((v) => [v.id, v.current_version])),
  };
  const result = await as(
    "service_role",
    null,
    "select public.submit_guest($1::jsonb,$2) as id",
    [JSON.stringify(input), "success-guest"],
  );
  assert.match(result.rows[0].id, /^[a-f0-9-]{36}$/);
  const payment = await db.query(
    "select status,verified_at from public.guest_payments where application_id=$1",
    [result.rows[0].id],
  );
  assert.equal(payment.rows[0].status, "pending");
  assert.equal(payment.rows[0].verified_at, null);
  const a = await db.query(
    "select rule_versions from public.guest_applications where id=$1",
    [result.rows[0].id],
  );
  assert.deepEqual(a.rows[0].rule_versions, input.rule_versions);
  await assert.rejects(
    as("service_role", null, "select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify({ ...input, phone: "01090909091", rule_versions: {} }),
      "stale-rules",
    ]),
  );
});
test("admin-managed private avatar can be read/deleted by its owner, never by another member", async () => {
  const name = `managed/${mid}/image.png`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('avatars',$1)",
    [name],
  );
  await adminQuery("select public.admin_set_avatar($1,$2)", [mid, name]);
  assert.equal(
    (await memberQuery("select name from storage.objects")).rows.length,
    1,
  );
  assert.equal(
    (await as("authenticated", other, "select name from storage.objects")).rows
      .length,
    0,
  );
  await memberQuery("select public.update_my_profile($1::jsonb)", [
    JSON.stringify({
      phone: "01022222222",
      position: "세터",
      experience: "2년",
      avatar_path: name,
    }),
  ]);
  await assert.rejects(
    memberQuery("select public.admin_set_avatar($1,$2)", [mid, null]),
  );
  await memberQuery("delete from storage.objects where name=$1", [name]);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
});
test("updating admin private memo/profile is transactional and unavailable to members", async () => {
  const profile = {
    name: "회원이름",
    phone: "01022222222",
    position: "세터",
    experience: "2년",
    birth_date: "1998-01-01",
    status: "active",
  };
  await assert.rejects(
    memberQuery("select public.admin_update_member($1,$2::jsonb,$3)", [
      mid,
      JSON.stringify(profile),
      "forged memo",
    ]),
  );
  await adminQuery("select public.admin_update_member($1,$2::jsonb,$3)", [
    mid,
    JSON.stringify(profile),
    "새 운영 메모",
  ]);
  assert.equal(
    (await memberQuery("select * from public.member_notes")).rows.length,
    0,
  );
  assert.equal(
    (
      await adminQuery(
        "select admin_memo from public.member_notes where member_id=$1",
        [mid],
      )
    ).rows[0].admin_memo,
    "새 운영 메모",
  );
});

test("guest privacy upgrade: six applications / four verified payments expose only four guests to members", async () => {
  const eid = "12121212-1212-4212-8212-121212121212";
  await db.query(
    "insert into public.events(id,title,starts_at,ends_at,location,kind,guests_open) values($1,'privacy event','2030-10-04T10:00:00Z','2030-10-04T13:00:00Z','체육관','game',true)",
    [eid],
  );
  for (let i = 0; i < 6; i++) {
    const g = (
      await db.query(
        "insert into public.guests(name,phone,position) values($1,$2,$3) returning id",
        [`비공개신청자${i}`, `0106100000${i}`, "세터"],
      )
    ).rows[0].id;
    const a = (
      await db.query(
        "insert into public.guest_applications(guest_id,event_id,answers,self_reported_paid) values($1,$2,$3,true) returning id",
        [
          g,
          eid,
          {
            experience: "비공개 3년",
            birth_date: "1998-01-01",
            notes: "비공개 신청내용",
          },
        ],
      )
    ).rows[0].id;
    await db.query(
      "insert into public.guest_payments(application_id,amount,status,verified_by) values($1,5000,$2,$3)",
      [a, i < 4 ? "paid" : "pending", i < 4 ? admin : null],
    );
  }
  const operational = (
    await adminQuery(
      "select public.admin_guest_counts($1,null,null) as counts",
      [eid],
    )
  ).rows[0].counts;
  assert.deepEqual(operational, { applications: 6, paid: 4, pending: 2 });
  const aggregate = (
    await memberQuery("select public.event_counts($1) as counts", [eid])
  ).rows[0].counts;
  assert.deepEqual(aggregate, { members: 0, guests: 4, total: 4 });
  assert.deepEqual(Object.keys(aggregate).sort(), [
    "guests",
    "members",
    "total",
  ]);
  await memberQuery("select public.respond_event($1,$2)", [eid, "yes"]);
  assert.deepEqual(
    (await memberQuery("select public.event_counts($1) as counts", [eid]))
      .rows[0].counts,
    { members: 1, guests: 4, total: 5 },
  );
  await assert.rejects(
    memberQuery("select public.admin_guest_counts($1,null,null)", [eid]),
  );
  await assert.rejects(
    as("anon", null, "select public.admin_guest_counts($1,null,null)", [eid]),
  );
  const messages = (
    await db.query(
      "select n.* from public.notifications n where n.kind='admin_application' and n.href like $1",
      [`%event=${eid}%`],
    )
  ).rows;
  assert.equal(messages.length, 6);
  assert.ok(
    messages.every(
      (n) =>
        n.user_id === admin &&
        n.title === "10월 4일 게스트 신청이 들어왔습니다." &&
        n.href.includes("application="),
    ),
  );
  assert.ok(
    messages.every(
      (n) => !n.title.includes("비공개") && !n.body.includes("비공개"),
    ),
  );
  assert.equal(
    (await memberQuery("select * from public.guests")).rows.length,
    0,
  );
  assert.equal(
    (
      await memberQuery(
        "select * from public.guest_applications where event_id=$1",
        [eid],
      )
    ).rows.length,
    0,
  );
});

test("database notification creation blocks member guest/roster messages regardless of legacy kind or admin link", async () => {
  const cases = [
    ["admin_application", "/events/test"],
    ["guest_application", "/calendar"],
    ["guest_payment", "/calendar"],
    ["participant_list", "/calendar"],
    ["daily_roster", "/calendar"],
    ["general", "/admin/roster?event=test"],
  ];
  for (let i = 0; i < cases.length; i++)
    await db.query("select private.notify($1,$2,$3,$4,$5,$6)", [
      member,
      "운영 알림",
      "비공개",
      cases[i][1],
      cases[i][0],
      `blocked-operational-${i}`,
    ]);
  assert.equal(
    (
      await db.query(
        "select * from public.notifications where dedupe_key like 'blocked-operational-%'",
      )
    ).rows.length,
    0,
  );
  await db.query("select private.notify($1,$2,$3,$4,$5,$6)", [
    member,
    "회원 긴급공지",
    "장소 변경",
    "/notices",
    "emergency",
    "allowed-member-emergency",
  ]);
  assert.equal(
    (
      await memberQuery(
        "select * from public.notifications where dedupe_key='allowed-member-emergency'",
      )
    ).rows.length,
    1,
  );
});

test("RLS hides historical misrouted admin-only inbox entries even when recipient is the member", async () => {
  for (const [kind, href] of [
    ["admin_application", "/admin/guests"],
    ["guest_application", "/events/test"],
    ["participant_list", "/calendar"],
    ["general", "/admin/roster?event=test"],
  ]) {
    await db.query(
      "insert into public.notifications(user_id,title,href,kind,dedupe_key) values($1,$2,$3,$4,$5)",
      [member, "과거 운영알림", href, kind, `historical-privacy-${kind}`],
    );
  }
  assert.equal(
    (
      await memberQuery(
        "select * from public.notifications where dedupe_key like 'historical-privacy-%'",
      )
    ).rows.length,
    0,
  );
  // A browser cannot bypass the permission by directly invoking the private clock helper.
  await assert.rejects(
    memberQuery("select private.prepare_daily_rosters('2040-06-01T04:00:00Z')"),
  );
});

test("KST 12:59/13:00 roster clock, no-event dates and duplicate invocations notify only active admins", async () => {
  const eid = "34343434-3434-4434-8434-343434343434";
  await db.query(
    "insert into public.events(id,title,starts_at,ends_at,location,kind) values($1,'13시 검증 운동','2040-06-01T10:00:00Z','2040-06-01T13:00:00Z','체육관','game')",
    [eid],
  );
  await db.exec(
    "insert into public.events(title,starts_at,ends_at,location,kind,status) values('취소 운동','2040-06-01T11:00:00Z','2040-06-01T13:00:00Z','체육관','game','cancelled'),('휴무','2040-06-01T11:00:00Z','2040-06-01T13:00:00Z','체육관','holiday','scheduled');",
  );
  assert.equal(
    (
      await db.query(
        "select private.prepare_daily_rosters('2040-06-01T03:59:59Z') as n",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select private.prepare_daily_rosters('2040-06-01T04:00:00Z') as n",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select private.prepare_daily_rosters('2040-06-01T05:00:00Z') as n",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select private.prepare_daily_rosters('2040-06-02T04:00:00Z') as n",
      )
    ).rows[0].n,
    0,
  );
  const rows = (
    await db.query(
      "select user_id,href from public.notifications where kind='admin_roster' and dedupe_key like '%2040-06-01'",
    )
  ).rows;
  assert.deepEqual(rows, [
    { user_id: admin, href: `/admin/roster?event=${eid}` },
  ]);
  assert.equal(
    (
      await memberQuery(
        "select * from public.notifications where kind='admin_roster'",
      )
    ).rows.length,
    0,
  );
});

test("upgrade preserves existing membership/payment/attendance rows and retires only misrouted outbox jobs", async () => {
  const counts = {};
  for (const t of [
    "members",
    "guests",
    "guest_applications",
    "guest_payments",
    "event_attendance",
    "membership_payments",
  ])
    counts[t] = (
      await db.query(`select count(*)::int as n from public.${t}`)
    ).rows[0].n;
  const notification = (
    await db.query(
      "select id from public.notifications where dedupe_key='historical-privacy-guest_application'",
    )
  ).rows[0].id;
  await db.query("insert into public.push_outbox(notification_id) values($1)", [
    notification,
  ]);
  const dailyDefinition = (
    await db.query(
      "select pg_get_functiondef('public.daily_notifications()'::regprocedure) as sql",
    )
  ).rows[0].sql;
  await db.exec(
    readFileSync(
      "supabase/migrations/202611020005_guest_notification_privacy.sql",
      "utf8",
    ),
  );
  await db.exec(dailyDefinition);
  for (const t of Object.keys(counts))
    assert.equal(
      (await db.query(`select count(*)::int as n from public.${t}`)).rows[0].n,
      counts[t],
      t,
    );
  const outbox = (
    await db.query(
      "select delivered_at,last_error from public.push_outbox where notification_id=$1",
      [notification],
    )
  ).rows[0];
  assert.ok(outbox.delivered_at);
  assert.equal(outbox.last_error, "ineligible operational recipient");
  assert.equal(
    (
      await db.query("select id from public.notifications where id=$1", [
        notification,
      ])
    ).rows.length,
    1,
  );
});

test("event CRUD preserves linked attendance and all six schedule kinds remain public-readable", async () => {
  const created = [];
  for (const kind of [
    "practice",
    "lesson",
    "game",
    "event",
    "match",
    "holiday",
  ]) {
    const r = await adminQuery(
      "insert into public.events(title,starts_at,ends_at,location,kind,description,guests_open) values($1,'2035-01-04T10:00:00Z','2035-01-04T13:00:00Z','원래 체육관',$2,'상세 안내',$3) returning id",
      [kind, kind, kind !== "holiday"],
    );
    created.push(r.rows[0].id);
  }
  assert.equal(
    (
      await as(
        "anon",
        null,
        "select * from public.events where id=any($1::uuid[])",
        [created],
      )
    ).rows.length,
    6,
  );
  const id = created[0];
  await adminQuery(
    "update public.events set location='변경 체육관',is_emergency=true,change_reason='체육관 변경 안내' where id=$1",
    [id],
  );
  const event = (
    await as("anon", null, "select * from public.events where id=$1", [id])
  ).rows[0];
  assert.equal(event.is_emergency, true);
  assert.equal(event.location, "변경 체육관");
  assert.equal(
    (
      await memberQuery(
        "update public.events set title='위조' where id=$1 returning id",
        [id],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    memberQuery(
      "insert into public.events(title,starts_at,ends_at,location,kind) values('위조',now(),now()+interval '1 hour','장소','game')",
    ),
  );
  await memberQuery("select public.respond_event($1,$2)", [id, "yes"]);
  await adminQuery(
    "update public.events set status='deleted',guests_open=false where id=$1",
    [id],
  );
  assert.equal(
    (await as("anon", null, "select * from public.events where id=$1", [id]))
      .rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.event_attendance where event_id=$1",
        [id],
      )
    ).rows.length,
    1,
  );
});

test("announcement audiences, publish windows and current-version reads are enforced by RLS", async () => {
  const ids = [];
  for (const audience of ["public", "member", "admin"])
    ids.push(
      (
        await adminQuery(
          "insert into public.announcements(title,content,kind,audience) values($1,'내용','required',$2) returning id",
          ["대상-" + audience, audience],
        )
      ).rows[0].id,
    );
  for (const [title, start, end] of [
    ["예약 공지", "2035-01-01T00:00:00Z", null],
    ["종료 공지", "2020-01-01T00:00:00Z", "2020-01-02T00:00:00Z"],
  ])
    ids.push(
      (
        await adminQuery(
          "insert into public.announcements(title,content,kind,audience,starts_at,ends_at) values($1,'내용','general','public',$2,$3) returning id",
          [title, start, end],
        )
      ).rows[0].id,
    );
  assert.equal(
    (
      await as(
        "anon",
        null,
        "select id from public.announcements where id=any($1::uuid[])",
        [ids],
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await memberQuery(
        "select id from public.announcements where id=any($1::uuid[])",
        [ids],
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (
      await adminQuery(
        "select id from public.announcements where id=any($1::uuid[])",
        [ids],
      )
    ).rows.length,
    5,
  );
  assert.equal(
    (
      await as(
        "anon",
        null,
        "select * from public.announcement_versions where announcement_id=any($1::uuid[])",
        [ids],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    as(
      "anon",
      null,
      "insert into public.announcements(title,content) values('위조','위조')",
    ),
  );
  await assert.rejects(
    memberQuery(
      "insert into public.announcements(title,content) values('위조','위조')",
    ),
  );
  assert.equal(
    (
      await memberQuery(
        "update public.announcements set content='위조' where id=$1 returning id",
        [ids[0]],
      )
    ).rows.length,
    0,
  );
  await adminQuery(
    "update public.announcements set content=$1,version=99 where id=$2",
    ["변경 내용", ids[0]],
  );
  const current = (
    await adminQuery("select * from public.announcements where id=$1", [ids[0]])
  ).rows[0];
  assert.equal(current.version, 2);
  assert.equal(current.created_by, admin);
  assert.deepEqual(
    (
      await as(
        "anon",
        null,
        "select version from public.announcement_versions where announcement_id=$1",
        [ids[0]],
      )
    ).rows,
    [{ version: 2 }],
  );
  assert.equal(
    (
      await adminQuery(
        "select * from public.announcement_versions where announcement_id=$1",
        [ids[0]],
      )
    ).rows.length,
    2,
  );
  await assert.rejects(
    db.query(
      "update public.announcement_versions set content='변조' where announcement_id=$1",
      [ids[0]],
    ),
  );
  await assert.rejects(
    adminQuery("delete from public.announcements where id=$1", [ids[0]]),
  );
  await adminQuery(
    "update public.announcements set deleted_at=now() where id=$1",
    [ids[0]],
  );
  assert.equal(
    (
      await as("anon", null, "select * from public.announcements where id=$1", [
        ids[0],
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await as(
        "anon",
        null,
        "select * from public.announcement_versions where announcement_id=$1",
        [ids[0]],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await adminQuery(
        "select * from public.announcement_versions where announcement_id=$1",
        [ids[0]],
      )
    ).rows.length,
    3,
  );
});

test("emergency priority is independent of recency, and deleted emergencies never create new notifications", async () => {
  const urgent = (
    await adminQuery(
      "insert into public.announcements(title,content,kind,audience,created_at) values('먼저 표시할 긴급','장소변경','emergency','public',now()-interval '1 month') returning id",
    )
  ).rows[0].id;
  for (const kind of ["general", "required", "event"])
    await adminQuery(
      "insert into public.announcements(title,content,kind,audience) values($1,$1,$2,$3)",
      [kind, kind, "public"],
    );
  const rows = (
    await as(
      "anon",
      null,
      "select kind,priority from public.announcements order by priority,created_at desc",
    )
  ).rows;
  assert.equal(rows[0].kind, "emergency");
  assert.equal(rows[0].priority, 0);
  await adminQuery(
    "update public.announcements set deleted_at=now() where id=$1",
    [urgent],
  );
  const count = async () =>
    Number(
      (
        await db.query(
          "select count(*) as n from public.notifications where dedupe_key like $1",
          [`emergency:${urgent}:%`],
        )
      ).rows[0].n,
    );
  const before = await count();
  await adminQuery("select public.publish_emergencies()");
  await as("service_role", null, "select public.daily_notifications()");
  assert.equal(await count(), before);
});

test("guest application keeps exact notice/rule versions; stale or private notice agreements cannot be submitted", async () => {
  const notice = (
    await adminQuery(
      "insert into public.announcements(title,content,kind,audience) values('게스트 필독','확인할 원문','required','public') returning id",
    )
  ).rows[0].id;
  const privateNotice = (
    await adminQuery(
      "insert into public.announcements(title,content,kind,audience) values('회원 전용 필독','회원만','required','member') returning id",
    )
  ).rows[0].id;
  const rules = Object.fromEntries(
    (await db.query("select id,current_version from public.rules")).rows.map(
      (r) => [r.id, r.current_version],
    ),
  );
  const notices = Object.fromEntries(
    (
      await as(
        "anon",
        null,
        "select id,version from public.announcements where kind in ('required','emergency')",
      )
    ).rows.map((n) => [n.id, n.version]),
  );
  const base = {
    name: "안내 확인 게스트",
    phone: "01070707070",
    position: "세터",
    event_id: event,
    privacy_consent: true,
    photo_consent: true,
    rules_consent: true,
    self_reported_paid: false,
    rule_versions: rules,
  };
  await assert.rejects(
    as("service_role", null, "select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify(base),
      "missing-notices",
    ]),
    /notices changed/,
  );
  const first = (
    await as(
      "service_role",
      null,
      "select public.submit_guest($1::jsonb,$2) as id",
      [
        JSON.stringify({ ...base, announcement_versions: notices }),
        "accepted-notices",
      ],
    )
  ).rows[0].id;
  const receipt = (
    await adminQuery(
      "select announcement_versions,rule_versions from public.guest_applications where id=$1",
      [first],
    )
  ).rows[0];
  assert.deepEqual(receipt.announcement_versions, notices);
  assert.deepEqual(receipt.rule_versions, rules);
  await adminQuery(
    "update public.announcements set content='바뀐 필독사항' where id=$1",
    [notice],
  );
  await assert.rejects(
    as("service_role", null, "select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify({
        ...base,
        phone: "01070707071",
        announcement_versions: notices,
      }),
      "stale-notices",
    ]),
    /notices changed/,
  );
  assert.equal(
    (
      await adminQuery(
        "select announcement_versions from public.guest_applications where id=$1",
        [first],
      )
    ).rows[0].announcement_versions[notice],
    1,
  );
  assert.equal(
    (
      await adminQuery(
        "select content from public.announcement_versions where announcement_id=$1 and version=1",
        [notice],
      )
    ).rows[0].content,
    "확인할 원문",
  );
  const latest = { ...notices, [notice]: 2, [privateNotice]: 1 };
  await assert.rejects(
    as("service_role", null, "select public.submit_guest($1::jsonb,$2)", [
      JSON.stringify({
        ...base,
        phone: "01070707072",
        announcement_versions: latest,
      }),
      "private-notice",
    ]),
    /notices changed/,
  );
});

test("atomic guest receipt returns only submitted event/payment; repeat phone links identity without disclosure or duplicate application", async () => {
  const input = await currentGuestInput();
  const submit = (data, key) =>
    as(
      "service_role",
      null,
      "select public.submit_guest_receipt($1::jsonb,$2) as receipt",
      [JSON.stringify(data), key],
    );
  const first = (await submit(input, "receipt-one")).rows[0].receipt;
  assert.deepEqual(Object.keys(first).sort(), [
    "event",
    "payment",
    "receipt",
    "self_reported_paid",
  ]);
  assert.equal(first.payment.status, "pending");
  assert.equal(first.self_reported_paid, true);
  const firstApp = (
    await adminQuery("select * from public.guest_applications where id=$1", [
      first.receipt,
    ])
  ).rows[0];
  assert.equal(firstApp.question_snapshot.length, 15);
  assert.deepEqual(firstApp.answers.question_versions, input.question_versions);
  const otherEvent = (
    await adminQuery(
      "insert into public.events(title,starts_at,ends_at,location,kind,guests_open,guest_fee) values('두 번째 방문 신청',now()+interval '5 days',now()+interval '5 days 3 hours','예시','game',true,15000) returning id",
    )
  ).rows[0].id;
  const second = (
    await submit(
      { ...input, event_id: otherEvent, name: "다른 이름", position: "리베로" },
      "receipt-two",
    )
  ).rows[0].receipt;
  const nextApp = (
    await adminQuery("select * from public.guest_applications where id=$1", [
      second.receipt,
    ])
  ).rows[0];
  assert.equal(nextApp.guest_id, firstApp.guest_id);
  assert.equal(second.payment.amount, 15000);
  assert.ok(!JSON.stringify(second).includes(input.phone));
  assert.ok(!JSON.stringify(second).includes(input.name));
  assert.equal(
    (
      await adminQuery("select name from public.guests where id=$1", [
        firstApp.guest_id,
      ])
    ).rows[0].name,
    input.name,
  );
  assert.equal(nextApp.answers.position, "리베로");
  await assert.rejects(submit(input, "duplicate-receipt"), /duplicate key/);
  assert.equal(
    Number(
      (
        await adminQuery(
          "select count(*) as n from public.guest_applications where guest_id=$1",
          [firstApp.guest_id],
        )
      ).rows[0].n,
    ),
    2,
  );
  const h = (
    await adminQuery("select public.admin_guest_history($1) as h", [
      firstApp.guest_id,
    ])
  ).rows[0].h;
  assert.equal(h.total_visits, 0);
  assert.equal(h.last_visited_at, null);
  for (const role of ["anon", "authenticated"])
    await assert.rejects(
      as(
        role,
        role === "authenticated" ? member : null,
        "select public.submit_guest_receipt($1::jsonb,$2)",
        [JSON.stringify(input), "forbidden-receipt"],
      ),
      /permission denied/,
    );
});

test("question revisions, required/select answers and archived snapshots are enforced atomically", async () => {
  const q = (
    await adminQuery(
      "insert into public.form_questions(form,key,label,type,options,required) values('guest','transport','이동 수단','select','[\"대중교통\",\"차량\"]',true) returning *",
    )
  ).rows[0];
  const input = await currentGuestInput({ phone: "01081818182" });
  const submit = (data) =>
    as(
      "service_role",
      null,
      "select public.submit_guest_receipt($1::jsonb,$2) as r",
      [JSON.stringify(data), "question-revision"],
    );
  await assert.rejects(submit(input), /required question unanswered/);
  await assert.rejects(
    submit({ ...input, extra_answers: { transport: "잘못된 선택" } }),
    /invalid question answer/,
  );
  const accepted = (
    await submit({ ...input, extra_answers: { transport: "대중교통" } })
  ).rows[0].r;
  await adminQuery(
    "update public.form_questions set label='교통편',options='[\"도보\",\"차량\"]' where id=$1",
    [q.id],
  );
  assert.equal(
    (
      await adminQuery(
        "select version from public.form_questions where id=$1",
        [q.id],
      )
    ).rows[0].version,
    2,
  );
  await assert.rejects(
    submit({
      ...input,
      phone: "01081818183",
      extra_answers: { transport: "차량" },
    }),
    /questions changed/,
  );
  await adminQuery(
    "update public.form_questions set deleted_at=now() where id=$1",
    [q.id],
  );
  assert.equal(
    (
      await as(
        "anon",
        null,
        "select id from public.form_questions where id=$1",
        [q.id],
      )
    ).rows.length,
    0,
  );
  const old = (
    await adminQuery(
      "select question_snapshot,answers from public.guest_applications where id=$1",
      [accepted.receipt],
    )
  ).rows[0];
  const frozen = old.question_snapshot.find((s) => s.id === q.id);
  assert.equal(frozen.label, "이동 수단");
  assert.equal(frozen.version, 1);
  assert.deepEqual(frozen.options, ["대중교통", "차량"]);
  assert.equal(old.answers.extra_answers.transport, "대중교통");
  const fresh = await currentGuestInput({ phone: "01081818183" });
  assert.ok((await submit(fresh)).rows[0].r.receipt);
  await assert.rejects(
    adminQuery("delete from public.form_questions where id=$1", [q.id]),
    /permission denied/,
  );
});

test("basic fields retain structure, labels version safely, ordinary members cannot edit questions", async () => {
  const q = (
    await adminQuery(
      "select * from public.form_questions where field_key='name' and form='guest'",
    )
  ).rows[0];
  await assert.rejects(
    adminQuery("update public.form_questions set active=false where id=$1", [
      q.id,
    ]),
    /protected/,
  );
  await assert.rejects(
    adminQuery("update public.form_questions set required=false where id=$1", [
      q.id,
    ]),
    /protected/,
  );
  await assert.rejects(
    memberQuery(
      "insert into public.form_questions(form,key,label,type) values('guest','forged','위조','text')",
    ),
    /row-level security/,
  );
  await adminQuery(
    "update public.form_questions set label='신청자 이름',help_text='입금자명과 동일하게 입력해주세요.' where id=$1",
    [q.id],
  );
  assert.equal(
    (
      await adminQuery(
        "select version from public.form_questions where id=$1",
        [q.id],
      )
    ).rows[0].version,
    2,
  );
});

test("notice and fee confirmations are mandatory even with self-reported payment", async () => {
  const input = await currentGuestInput({ phone: "01081818184" });
  for (const field of ["notice_consent", "fee_acknowledgement"]) {
    await assert.rejects(
      as(
        "service_role",
        null,
        "select public.submit_guest_receipt($1::jsonb,$2)",
        [JSON.stringify({ ...input, [field]: false }), `missing-${field}`],
      ),
      /invalid application/,
    );
  }
});

test("verified payment is idempotent; actual guest visits require admin confirmation after a paid event ends", async () => {
  const a = (
    await db.query(
      "insert into public.guest_applications(guest_id,event_id,answers) values($1,$2,'{}') returning id",
      [guest, past],
    )
  ).rows[0].id;
  await db.query(
    "insert into public.guest_payments(application_id,amount) values($1,15000)",
    [a],
  );
  await assert.rejects(
    adminQuery("select public.check_guest_attendance($1,true)", [a]),
    /past paid event required/,
  );
  await adminQuery("select public.confirm_guest_payment($1)", [a]);
  const verified = (
    await adminQuery(
      "select verified_at,verified_by from public.guest_payments where application_id=$1",
      [a],
    )
  ).rows[0];
  await adminQuery("select public.confirm_guest_payment($1)", [a]);
  assert.deepEqual(
    (
      await adminQuery(
        "select verified_at,verified_by from public.guest_payments where application_id=$1",
        [a],
      )
    ).rows[0],
    verified,
  );
  await adminQuery("select public.confirm_guest_payment($1)", [application]);
  await assert.rejects(
    adminQuery("select public.check_guest_attendance($1,true)", [application]),
    /past paid event required/,
  );
  await assert.rejects(
    memberQuery("select public.check_guest_attendance($1,true)", [a]),
    /forbidden/,
  );
  await assert.rejects(
    memberQuery("select public.admin_guest_history($1)", [guest]),
    /forbidden/,
  );
  await assert.rejects(
    as("anon", null, "select public.admin_guest_history($1)", [guest]),
    /permission denied/,
  );
  await adminQuery("select public.check_guest_attendance($1,true)", [a]);
  const h = (
    await adminQuery("select public.admin_guest_history($1) as h", [guest])
  ).rows[0].h;
  assert.equal(h.total_visits, 1);
  assert.ok(h.last_visited_at);
  await adminQuery("select public.check_guest_attendance($1,false)", [a]);
  assert.equal(
    (await adminQuery("select public.admin_guest_history($1) as h", [guest]))
      .rows[0].h.total_visits,
    0,
  );
  assert.equal(
    (
      await memberQuery(
        "select actual_attended from public.guest_applications where id=$1",
        [a],
      )
    ).rows.length,
    0,
  );
});

test("member name approval preserves all UUID-linked records, hides other requests and rejects stale or repeated decisions", async () => {
  const before = (
    await adminQuery("select name from public.members where id=$1", [mid])
  ).rows[0].name;
  const attendance = (
    await adminQuery(
      "select id,member_id,response,actual from public.event_attendance where member_id=$1 order by id",
      [mid],
    )
  ).rows;
  const dues = (
    await adminQuery(
      "select * from public.membership_payments where member_id=$1 order by id",
      [mid],
    )
  ).rows;
  const id = (
    await memberQuery(
      "select public.request_member_name('승인된 새 이름','표기 정정') as id",
    )
  ).rows[0].id;
  assert.equal(
    (await memberQuery("select name from public.members")).rows[0].name,
    before,
  );
  await assert.rejects(
    memberQuery("select public.request_member_name('두 번째 요청','')"),
    /duplicate key/,
  );
  assert.equal(
    (
      await as(
        "authenticated",
        other,
        "select * from public.member_name_requests where id=$1",
        [id],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    memberQuery("select public.review_member_name($1,'approved','위조')", [id]),
    /forbidden/,
  );
  await adminQuery(
    "select public.review_member_name($1,'approved','본인 확인 완료')",
    [id],
  );
  assert.equal(
    (await memberQuery("select name from public.members")).rows[0].name,
    "승인된 새 이름",
  );
  assert.deepEqual(
    (
      await adminQuery(
        "select id,member_id,response,actual from public.event_attendance where member_id=$1 order by id",
        [mid],
      )
    ).rows,
    attendance,
  );
  assert.deepEqual(
    (
      await adminQuery(
        "select * from public.membership_payments where member_id=$1 order by id",
        [mid],
      )
    ).rows,
    dues,
  );
  assert.equal(
    (
      await memberQuery(
        "select review_note from public.member_name_requests where id=$1",
        [id],
      )
    ).rows[0].review_note,
    "본인 확인 완료",
  );
  await assert.rejects(
    adminQuery("select public.review_member_name($1,'approved','')", [id]),
    /invalid name request/,
  );
  const stale = (
    await memberQuery(
      "select public.request_member_name('옛 요청의 이름','') as id",
    )
  ).rows[0].id;
  await adminQuery(
    "update public.members set name='관리자 직접 수정' where id=$1",
    [mid],
  );
  await assert.rejects(
    adminQuery("select public.review_member_name($1,'approved','')", [stale]),
    /name changed/,
  );
  await adminQuery(
    "select public.review_member_name($1,'rejected','이미 직접 수정됨')",
    [stale],
  );
  assert.equal(
    (await memberQuery("select name from public.members")).rows[0].name,
    "관리자 직접 수정",
  );
  const recipients = (
    await db.query(
      "select distinct user_id from public.notifications where kind='admin_name_request'",
    )
  ).rows;
  assert.deepEqual(recipients, [{ user_id: admin }]);
});

test("member photos attach immediately only for existing own storage objects; profile forms cannot reassign photos", async () => {
  const own = `${member}/new-photo.png`,
    foreign = `${other}/private-photo.png`;
  await memberQuery(
    "insert into storage.objects(bucket_id,name) values('avatars',$1)",
    [own],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('avatars',$1)",
    [foreign],
  );
  await assert.rejects(
    memberQuery("select public.set_my_avatar($1)", [foreign]),
    /invalid avatar/,
  );
  await assert.rejects(
    memberQuery("select public.set_my_avatar($1)", [`${member}/missing.png`]),
    /invalid avatar/,
  );
  await memberQuery("select public.set_my_avatar($1)", [own]);
  assert.equal(
    (await memberQuery("select avatar_path from public.members")).rows[0]
      .avatar_path,
    own,
  );
  await assert.rejects(
    memberQuery("select public.update_my_profile($1::jsonb)", [
      JSON.stringify({
        phone: "01022222222",
        position: "센터",
        experience: "3년",
        avatar_path: null,
      }),
    ]),
    /use avatar command/,
  );
  await memberQuery("select public.update_my_profile($1::jsonb)", [
    JSON.stringify({
      phone: "01022222222",
      position: "센터",
      experience: "3년",
    }),
  ]);
  assert.equal(
    (await memberQuery("select avatar_path from public.members")).rows[0]
      .avatar_path,
    own,
  );
  assert.equal(
    (
      await as(
        "authenticated",
        other,
        "select name from storage.objects where name=$1",
        [own],
      )
    ).rows.length,
    0,
  );
  await memberQuery("select public.set_my_avatar(null)");
  await memberQuery("delete from storage.objects where name=$1", [own]);
  assert.equal(
    (await memberQuery("select avatar_path from public.members")).rows[0]
      .avatar_path,
    null,
  );
});

test("own activity summary uses event dates, exact totals beyond a screen page and excludes future/cancelled attendance", async () => {
  const before = (await memberQuery("select public.my_activity_summary() as s"))
    .rows[0].s;
  await db.query(
    `with e as (
    insert into public.events(title,starts_at,ends_at,location,kind,status)
    select '집계 검증 '||n,now()-interval '2 minutes',now()-interval '1 minute','예시','practice','completed' from generate_series(1,501) n returning id
   ) insert into public.event_attendance(event_id,member_id,actual) select id,$1,true from e`,
    [mid],
  );
  await db.query(
    `with e as (
    insert into public.events(title,starts_at,ends_at,location,kind,status) values
    ('미래의 잘못된 실제출석',now()+interval '1 day',now()+interval '2 days','예시','game','scheduled'),
    ('취소된 출석',now()-interval '2 minutes',now()-interval '1 minute','예시','game','cancelled') returning id
   ) insert into public.event_attendance(event_id,member_id,actual) select id,$1,true from e`,
    [mid],
  );
  const summary = (
    await memberQuery("select public.my_activity_summary() as s")
  ).rows[0].s;
  assert.equal(summary.year_attendance, before.year_attendance + 501);
  assert.equal(summary.month_attendance, before.month_attendance + 501);
  assert.ok(new Date(summary.last_attended_at) < new Date());
  assert.equal(summary.current_month_payment.status, "unpaid");
  const own = (
    await as("authenticated", other, "select public.my_activity_summary() as s")
  ).rows[0].s;
  assert.ok(own.year_attendance < summary.year_attendance);
  await assert.rejects(
    as("anon", null, "select public.my_activity_summary()"),
    /permission denied/,
  );
});

test("membership hold/reject keep the account inactive; approval activates exactly one member without inferring paid dues", async () => {
  const user = "55555555-5555-4555-8555-555555555555";
  await db.query(
    "insert into auth.users values($1,'new-member@example.invalid')",
    [user],
  );
  const versions = Object.fromEntries(
    (await db.query("select id,current_version from public.rules")).rows.map(
      (r) => [r.id, r.current_version],
    ),
  );
  const input = {
    name: "가입 검토",
    phone: "01090909090",
    birth_date: "1999-02-03",
    gender: "여성",
    position: "리베로",
    experience: "2년",
    source: "지인",
    notes: "확인 부탁드립니다",
    current_month_guest_participated: true,
    current_month_guest: "이번 달 1회",
    self_reported_paid: true,
    privacy_consent: true,
    photo_consent: true,
    rules_consent: true,
    rule_versions: versions,
  };
  const id = (
    await as(
      "authenticated",
      user,
      "select public.submit_membership($1::jsonb) as id",
      [JSON.stringify(input)],
    )
  ).rows[0].id;
  await assert.rejects(
    as(
      "authenticated",
      user,
      "select public.review_membership_with_note($1,'approved',null,'')",
      [id],
    ),
    /forbidden/,
  );
  for (const status of ["hold", "rejected"]) {
    await adminQuery(
      "select public.review_membership_with_note($1,$2,null,'본인 확인 필요')",
      [id, status],
    );
    assert.equal(
      (await as("authenticated", user, "select * from public.members")).rows
        .length,
      0,
    );
    const a = (
      await as(
        "authenticated",
        user,
        "select * from public.member_applications",
      )
    ).rows[0];
    assert.equal(a.status, status);
    assert.equal(a.review_note, "본인 확인 필요");
    assert.ok(a.reviewed_at);
    await assert.rejects(
      as("authenticated", user, "select public.my_activity_summary()"),
      /forbidden/,
    );
  }
  await adminQuery(
    "select public.review_membership_with_note($1,'approved',null,'가입 승인')",
    [id],
  );
  const m = (await as("authenticated", user, "select * from public.members"))
    .rows[0];
  assert.equal(m.status, "active");
  assert.equal(new Date(m.birth_date).toISOString().slice(0, 10), "1999-02-03");
  assert.equal(
    (await as("authenticated", user, "select * from public.admins")).rows
      .length,
    0,
  );
  assert.equal(
    (
      await as(
        "authenticated",
        user,
        "select * from public.membership_payments where status='paid'",
      )
    ).rows.length,
    0,
  );
});

test("future directory preferences default to no disclosure and do not open private profiles or admin roles", async () => {
  await db.query(
    "insert into public.member_directory_preferences(member_id) values($1),($2)",
    [mid, oid],
  );
  const rows = (
    await memberQuery("select * from public.member_directory_preferences")
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].member_id, mid);
  assert.equal(rows[0].show_name, false);
  assert.equal(rows[0].show_photo, false);
  assert.equal(rows[0].show_position, false);
  await assert.rejects(
    as("anon", null, "select * from public.member_directory_preferences"),
    /permission denied/,
  );
  assert.equal(
    (await memberQuery("select * from public.members where id=$1", [oid])).rows
      .length,
    0,
  );
  await adminQuery(
    "update public.admins set titles=array['회장','코치','게스트 담당'] where member_id=$1",
    [aid],
  );
  assert.deepEqual(
    (
      await adminQuery("select titles from public.admins where member_id=$1", [
        aid,
      ])
    ).rows[0].titles,
    ["회장", "코치", "게스트 담당"],
  );
  assert.equal(
    (await memberQuery("select * from public.member_notes")).rows.length,
    0,
  );
});

test("RSVP supports yes/no/unanswered in the real database, changes only the caller and never confirms attendance", async () => {
  const id = (
    await adminQuery(
      "insert into public.events(title,starts_at,ends_at,location,kind) values('응답 검증',now()+interval '10 days',now()+interval '10 days 3 hours','예시','game') returning id",
    )
  ).rows[0].id;
  await as("authenticated", other, "select public.respond_event($1,'yes')", [
    id,
  ]);
  for (const response of ["yes", "no", "unanswered"]) {
    await memberQuery("select public.respond_event($1,$2)", [id, response]);
    const row = (
      await memberQuery(
        "select * from public.event_attendance where event_id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(row.member_id, mid);
    assert.equal(row.response, response);
    assert.equal(row.actual, null);
    assert.equal(row.checked_at, null);
    const counts = (
      await memberQuery("select public.event_counts($1) as c", [id])
    ).rows[0].c;
    assert.equal(counts.members, response === "yes" ? 2 : 1);
  }
  await assert.rejects(
    memberQuery("select public.respond_event($1,'paid')", [id]),
    /invalid response/,
  );
  await assert.rejects(
    adminQuery("select public.check_attendance($1,$2,true)", [id, mid]),
    /event has not ended/,
  );
  await adminQuery("select public.check_attendance($1,$2,false)", [past, mid]);
  const actual = (
    await memberQuery(
      "select * from public.event_attendance where event_id=$1",
      [past],
    )
  ).rows[0];
  assert.equal(actual.actual, false);
  assert.equal(actual.checked_by, admin);
  assert.ok(actual.checked_at);
});

test("year/month reports preserve KST boundaries and paginate exact actual attendance beyond 500 records", async () => {
  const year = Number(
    (
      await db.query(
        "select extract(year from now() at time zone 'Asia/Seoul') as y",
      )
    ).rows[0].y,
  );
  const first = (
    await memberQuery("select public.my_attendance_report($1,0) as r", [year])
  ).rows[0].r;
  assert.ok(first.total > 500);
  assert.equal(first.rows.length, 30);
  assert.equal(first.summary.months.length, 12);
  assert.equal(
    first.summary.months.reduce((n, m) => n + m.count, 0),
    first.summary.year_attendance,
  );
  const last = (
    await memberQuery("select public.my_attendance_report($1,16) as r", [year])
  ).rows[0].r;
  assert.ok(last.rows.length > 0);
  assert.ok(!last.rows.some((a) => first.rows.some((b) => b.id === a.id)));
  assert.ok(first.rows.every((a) => a.member_id === mid));
  await assert.rejects(
    memberQuery("select public.admin_attendance_report($1,$2,0)", [oid, year]),
    /forbidden/,
  );
  await assert.rejects(
    memberQuery("select private.member_attendance_report($1,$2,0)", [
      oid,
      year,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    memberQuery("select public.my_attendance_report(2026,-1)"),
    /invalid report range/,
  );
  const before = (
    await adminQuery("select public.admin_attendance_report($1,$2,0) as r", [
      oid,
      year - 1,
    ])
  ).rows[0].r;
  const beforeOlder = (
    await adminQuery("select public.admin_attendance_report($1,$2,0) as r", [
      oid,
      year - 2,
    ])
  ).rows[0].r;
  await db.query(
    `with e as (
    insert into public.events(title,starts_at,ends_at,location,kind,status)
    select 'KST 경계',v,v+interval '1 hour','예시','practice','completed' from (values
     (make_timestamptz($1-2,12,31,14,30,0,'UTC')),
     (make_timestamptz($1-2,12,31,15,30,0,'UTC'))) t(v) returning id
   ) insert into public.event_attendance(event_id,member_id,actual) select id,$2,true from e`,
    [year, oid],
  );
  const after = (
    await adminQuery("select public.admin_attendance_report($1,$2,0) as r", [
      oid,
      year - 1,
    ])
  ).rows[0].r;
  const older = (
    await adminQuery("select public.admin_attendance_report($1,$2,0) as r", [
      oid,
      year - 2,
    ])
  ).rows[0].r;
  assert.equal(
    after.summary.months[0].count,
    before.summary.months[0].count + 1,
  );
  assert.equal(
    older.summary.months[11].count,
    beforeOlder.summary.months[11].count + 1,
  );
  const own = (
    await as(
      "authenticated",
      other,
      "select public.my_attendance_report($1,0) as r",
      [year - 1],
    )
  ).rows[0].r;
  assert.deepEqual(own, after);
});

test("admin dashboard uses the selected workout for 6/4/2 totals and unanswered tasks, returns latest five, and is admin-only", async () => {
  const eventId = (
    await adminQuery(
      "insert into public.events(title,starts_at,ends_at,location,kind,guests_open) values('오늘 운영 운동',date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'+interval '20 hours',date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'+interval '23 hours','체육관','game',true) returning id",
    )
  ).rows[0].id;
  await db.query(
    `with guests as (
   insert into public.guests(name,phone,position) select '대시보드 게스트 '||i,'0109292929'||i,'세터' from generate_series(0,5) i returning id
  ), apps as (
   insert into public.guest_applications(guest_id,event_id,answers,self_reported_paid) select id,$1,'{"gender":"여성","experience":"2년"}',true from guests returning id
  ) insert into public.guest_payments(application_id,amount,status) select id,5000,case when row_number() over(order by id)<=4 then 'paid' else 'pending' end from apps`,
    [eventId],
  );
  await db.query(
    "insert into public.event_attendance(event_id,member_id,response) values($1,$2,'yes'),($1,$3,'no')",
    [eventId, mid, oid],
  );
  const dashboard = (
    await adminQuery("select public.admin_dashboard($1) as d", [eventId])
  ).rows[0].d;
  assert.deepEqual(dashboard.guest_summary, {
    applications: 6,
    paid: 4,
    pending: 2,
  });
  assert.deepEqual(dashboard.counts, { members: 1, guests: 4, total: 5 });
  const active = Number(
    (
      await db.query(
        "select count(*) as n from public.members where status='active'",
      )
    ).rows[0].n,
  );
  assert.equal(dashboard.tasks.unanswered, active - 2);
  assert.equal(dashboard.recent_guests.length, 5);
  assert.ok(dashboard.recent_guests.every((g) => g.event_id === eventId));
  assert.ok(dashboard.today_events.some((e) => e.id === eventId));
  await assert.rejects(
    memberQuery("select public.admin_dashboard($1)", [eventId]),
    /forbidden/,
  );
  await assert.rejects(
    as("anon", null, "select public.admin_dashboard(null)"),
    /permission denied/,
  );
  const counts = (
    await memberQuery("select public.event_counts($1) as c", [eventId])
  ).rows[0].c;
  assert.deepEqual(Object.keys(counts).sort(), ["guests", "members", "total"]);
  assert.equal(counts.guests, 4);
  const detail = (
    await adminQuery("select public.admin_member_summary($1) as s", [mid])
  ).rows[0].s;
  const mine = (await memberQuery("select public.my_activity_summary() as s"))
    .rows[0].s;
  assert.equal(detail.year_attendance, mine.year_attendance);
  assert.equal(detail.last_attended, mine.last_attended_at);
  assert.deepEqual(detail.current_month_payment, mine.current_month_payment);
  await assert.rejects(
    memberQuery("select public.admin_member_summary($1)", [oid]),
    /forbidden/,
  );
});

test("monthly dues summaries keep paid/unpaid/exempt separate, missing records do not become unpaid and members cannot change dues", async () => {
  const month = (
    await db.query(
      "select date_trunc('month',now() at time zone 'Asia/Seoul')::date as month",
    )
  ).rows[0].month;
  await adminQuery(
    "insert into public.membership_payments(member_id,month,status,amount) values($1,$2,'exempt',60000) on conflict(member_id,month) do update set status='exempt'",
    [aid, month],
  );
  const before = (
    await adminQuery("select public.admin_dues_summary($1,null) as s", [month])
  ).rows[0].s;
  const expected = (
    await db.query(
      "select count(*) filter(where status='paid') as paid,count(*) filter(where status='unpaid') as unpaid,count(*) filter(where status='exempt') as exempt from public.membership_payments where month=$1",
      [month],
    )
  ).rows[0];
  assert.equal(before.paid, Number(expected.paid));
  assert.equal(before.unpaid, Number(expected.unpaid));
  assert.equal(before.exempt, Number(expected.exempt));
  const own = (
    await adminQuery("select public.admin_dues_summary($1,$2) as s", [
      month,
      mid,
    ])
  ).rows[0].s;
  assert.equal(own.unpaid, 1);
  assert.equal(own.registered, 1);
  await assert.rejects(
    memberQuery("select public.admin_dues_summary($1,null)", [month]),
    /forbidden/,
  );
  const update = (
    await memberQuery(
      "update public.membership_payments set status='paid' where member_id=$1 and month=$2 returning id",
      [mid, month],
    )
  ).rows;
  assert.equal(update.length, 0);
  assert.equal(
    (
      await memberQuery(
        "select * from public.membership_payments where member_id=$1",
        [oid],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    adminQuery("select public.admin_dues_summary('2026-01-02',null)"),
    /invalid report range/,
  );
});

test("new membership notifications and their outbox jobs target only active admins", async () => {
  const user = "66666666-6666-4666-8666-666666666666";
  await db.query(
    "insert into auth.users values($1,'operations-applicant@example.invalid')",
    [user],
  );
  const input = await currentGuestInput({
    name: "새 운영 회원",
    phone: "01093939393",
  });
  const id = (
    await as(
      "authenticated",
      user,
      "select public.submit_membership($1::jsonb) as id",
      [JSON.stringify(input)],
    )
  ).rows[0].id;
  const notifications = (
    await db.query(
      "select n.user_id,n.href,n.kind,o.id as job from public.notifications n join public.push_outbox o on o.notification_id=n.id where n.dedupe_key=$1",
      [`member_applications:${id}`],
    )
  ).rows;
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].user_id, admin);
  assert.equal(notifications[0].href, "/admin/members");
  assert.ok(notifications[0].job);
  assert.equal(
    (
      await memberQuery(
        "select * from public.notifications where dedupe_key=$1",
        [`member_applications:${id}`],
      )
    ).rows.length,
    0,
  );
});

test("dashboard without any valid workout has zero participation and zero unanswered members", async () => {
  const events = (await db.query("select id,status from public.events")).rows;
  try {
    await db.query("update public.events set status='cancelled'");
    const result = (
      await adminQuery("select public.admin_dashboard(null) as d")
    ).rows[0].d;
    assert.equal(result.event, null);
    assert.deepEqual(result.counts, { members: 0, guests: 0, total: 0 });
    assert.equal(result.tasks.unanswered, 0);
    assert.deepEqual(result.today_events, []);
  } finally {
    await db.query(
      "update public.events e set status=x.status from jsonb_to_recordset($1::jsonb) as x(id uuid,status text) where e.id=x.id",
      [JSON.stringify(events)],
    );
  }
});

test("admin event attendance paginates members, filters unanswered and retains inactive historical attendees", async () => {
  await db.query(
    "insert into public.members(name,phone) select '페이지 '||lpad(n::text,4,'0'),'0109494'||lpad(n::text,4,'0') from generate_series(1,35) n",
  );
  const inactive = (
    await db.query(
      "insert into public.members(name,phone,status) values('지난 회원','01095959595','inactive') returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into public.event_attendance(event_id,member_id,response,actual) values($1,$2,$3,true)",
    [past, inactive, "yes"],
  );
  const first = (
    await adminQuery("select public.admin_event_attendance($1,'all',0) as d", [
      past,
    ])
  ).rows[0].d;
  const next = (
    await adminQuery("select public.admin_event_attendance($1,'all',1) as d", [
      past,
    ])
  ).rows[0].d;
  assert.equal(first.members.length, 30);
  assert.ok(next.members.length > 0);
  assert.ok(
    !next.members.some((m) => first.members.some((n) => n.id === m.id)),
  );
  assert.equal(first.total, first.summary.members);
  assert.ok(first.summary.present >= 1);
  const yes = (
    await adminQuery("select public.admin_event_attendance($1,'yes',0) as d", [
      past,
    ])
  ).rows[0].d;
  assert.ok(yes.members.some((m) => m.id === inactive));
  const unanswered = (
    await adminQuery(
      "select public.admin_event_attendance($1,'unanswered',0) as d",
      [past],
    )
  ).rows[0].d;
  assert.ok(unanswered.attendance.every((a) => a.response === "unanswered"));
  assert.ok(
    first.members.every((m) => !("phone" in m) && !("birth_date" in m)),
  );
  await assert.rejects(
    memberQuery("select public.admin_event_attendance($1,'all',0)", [past]),
    /forbidden/,
  );
});

test("archive preserves legacy public videos/playlists while denying anonymous and pending access to both underlying tables and feed", async () => {
  const unapproved = "77777777-7777-4777-8777-777777777777";
  await db.query(
    "insert into auth.users(id,email) values($1,'unapproved@example.invalid')",
    [unapproved],
  );
  const video = (
    await db.query(
      "insert into public.videos(title,url,video_id,filmed_on,visibility) values('이전 공개 영상','https://youtu.be/abcdefghijk','abcdefghijk','2026-10-04','public') returning id",
    )
  ).rows[0];
  const playlist = (
    await db.query(
      "insert into public.video_playlists(title,url,playlist_id,visibility) values('이전 재생목록','https://youtube.com/playlist?list=PLlegacy12345','PLlegacy12345','public') returning id",
    )
  ).rows[0];
  for (const table of ["videos", "video_playlists"]) {
    assert.equal(
      (await as("anon", null, `select * from public.${table}`)).rows.length,
      0,
    );
    assert.equal(
      (await as("authenticated", unapproved, `select * from public.${table}`))
        .rows.length,
      0,
    );
  }
  await assert.rejects(as("anon", null, "select * from public.video_archive"));
  assert.equal(
    (
      await as(
        "authenticated",
        unapproved,
        "select * from public.video_archive",
      )
    ).rows.length,
    0,
  );
  const rows = (
    await memberQuery(
      "select * from public.video_archive where id in ($1,$2)",
      [video.id, playlist.id],
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === playlist.id).source, "playlists");
  assert.equal(
    rows.find((r) => r.id === playlist.id).date_source,
    "registered",
  );
  await assert.rejects(
    memberQuery(
      "update public.video_playlists set title='변경' where id=$1 returning id",
      [playlist.id],
    ).then((r) => {
      if (!r.rows.length) throw Error("denied");
    }),
  );
  const updated = await adminQuery(
    "update public.video_playlists set filmed_on='2026-10-04',video_count=12,kind='game',event_id=$1 where id=$2 returning id",
    [event, playlist.id],
  );
  assert.equal(updated.rows.length, 1);
  const entry = (
    await memberQuery(
      "select * from public.video_archive where source='playlists' and id=$1",
      [playlist.id],
    )
  ).rows[0];
  assert.equal(entry.video_count, 12);
  assert.equal(entry.date_source, "filmed");
  assert.equal(entry.event_id, event);
});

test("admin roster contains only active yes members and verified guests, preserves application snapshots, and excludes all private fields", async () => {
  const e = (
    await db.query(
      "insert into public.events(title,starts_at,ends_at,location,kind) values('공유 검증',now()+interval '7 days',now()+interval '7 days 2 hours','체육관','game') returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into public.event_attendance(event_id,member_id,response) values($1,$2,'yes'),($1,$3,'no')",
    [e, mid, oid],
  );
  const applications = [];
  for (let i = 0; i < 2; i++) {
    const g = (
      await db.query(
        "insert into public.guests(name,phone,position) values($1,$2,'센터') returning id",
        [`기본이름${i}`, `0109200000${i}`],
      )
    ).rows[0].id;
    const a = (
      await db.query(
        "insert into public.guest_applications(guest_id,event_id,answers,self_reported_paid) values($1,$2,$3,true) returning id",
        [
          g,
          e,
          JSON.stringify({
            name: `신청이름${i}`,
            position: "세터",
            notes: "비공개 메모",
            birth_date: "1990-01-01",
            phone: `0109200000${i}`,
          }),
        ],
      )
    ).rows[0].id;
    applications.push(a);
    await db.query(
      "insert into public.guest_payments(application_id,amount,status) values($1,5000,$2)",
      [a, i === 0 ? "paid" : "pending"],
    );
  }
  for (const user of [member, pending])
    await assert.rejects(
      as("authenticated", user, "select public.admin_roster($1)", [e]),
    );
  await assert.rejects(as("anon", null, "select public.admin_roster($1)", [e]));
  const roster = (
    await adminQuery("select public.admin_roster($1) as data", [e])
  ).rows[0].data;
  assert.deepEqual(roster.counts, { members: 1, guests: 1, total: 2 });
  assert.deepEqual(roster.guests, [{ name: "신청이름0", position: "세터" }]);
  for (const person of [...roster.members, ...roster.guests])
    assert.deepEqual(Object.keys(person).sort(), ["name", "position"]);
  assert.ok(!JSON.stringify(roster).includes("010920"));
  assert.ok(!JSON.stringify(roster).includes("비공개 메모"));
  assert.ok(!JSON.stringify(roster).includes("신청이름1"));
  await db.query("update public.events set status='cancelled' where id=$1", [
    e,
  ]);
  await assert.rejects(adminQuery("select public.admin_roster($1)", [e]));
});

test("analytics is admin-only, zero-fills months and counts only confirmed visits", async () => {
  for (const user of [member, pending])
    await assert.rejects(
      as("authenticated", user, "select public.club_analytics('2001-01-01')"),
    );
  await assert.rejects(
    as("anon", null, "select public.club_analytics('2001-01-01')"),
  );
  await assert.rejects(
    adminQuery("select public.club_analytics('2001-01-02')"),
  );
  const e = (
    await db.query(
      "insert into public.events(title,starts_at,ends_at,location,kind,status) values('analytics fixture','2001-01-10T09:00:00+09:00','2001-01-10T12:00:00+09:00','gym','game','completed') returning id",
    )
  ).rows[0].id;
  await db.query(
    "insert into public.event_attendance(event_id,member_id,response,actual) values($1,$2,'yes',true),($1,$3,'yes',false)",
    [e, mid, oid],
  );
  await db.query(
    "insert into public.guest_applications(guest_id,event_id,submitted_at,answers,actual_attended) values($1,$2,'2001-01-01T00:00:00+09:00',$3,true)",
    [guest, e, JSON.stringify({ "SpotLight를 알게 된 경로": "Instagram" })],
  );
  const data = (
    await adminQuery("select public.club_analytics('2001-01-01') as data")
  ).rows[0].data;
  assert.equal(data.average_participants, 2);
  assert.equal(data.new_guests, 1);
  assert.equal(data.returning_guests, 0);
  assert.equal(data.return_rate, 0);
  assert.equal(data.monthly.length, 6);
  assert.equal(data.monthly[5].value, 1);
  assert.equal(data.monthly_participants[5].value, 2);
  assert.equal(data.monthly_average[5].value, 2);
  assert.deepEqual(
    data.participant_ratio.map((r) => r.value),
    [50, 50],
  );
  assert.equal(data.sources.find((r) => r.label === "Instagram").value, 1);
  assert.equal(data.member_attendance.find((r) => r.id === mid).value, 1);
  assert.equal(data.member_attendance.find((r) => r.id === oid).value, 0);
});

test("weekly schedule fills Korea dates once, preserves edits, and limits operations to admins", async () => {
  const generate = "select public.extend_regular_schedule() as added";
  await assert.rejects(memberQuery(generate));
  await assert.rejects(as("anon", null, generate));
  const first = await adminQuery(generate);
  assert.ok(first.rows[0].added > 0);
  // Earlier fixtures may already occupy regular slots. Count covered dates, including those fixtures.
  const covered = await adminQuery(`
    select count(distinct local_day)::int as days from (
      select (starts_at at time zone 'Asia/Seoul')::date local_day, kind from public.events
    ) e where local_day between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date+55
    and ((extract(isodow from local_day) in (1,5) and kind='lesson')
      or (extract(isodow from local_day) in (2,4,7) and kind='game'))
  `);
  assert.ok(covered.rows[0].days >= 39);
  const slots = (
    await adminQuery(
      "select id,kind,regular_date,location,guest_fee,guests_open,extract(isodow from regular_date)::int dow,to_char(starts_at at time zone 'Asia/Seoul','HH24:MI') start,to_char(ends_at at time zone 'Asia/Seoul','HH24:MI') finish from public.events where regular_date is not null",
    )
  ).rows;
  for (const s of slots) {
    assert.ok([1, 2, 4, 5, 7].includes(s.dow));
    assert.equal(s.location, "광명동초등학교");
    assert.equal(s.guests_open, true);
    assert.equal(s.kind, [1, 5].includes(s.dow) ? "lesson" : "game");
    assert.equal(s.guest_fee, s.kind === "lesson" ? 15000 : 5000);
    assert.equal(s.start, s.dow === 7 ? "17:00" : "18:00");
    assert.equal(s.finish, s.dow === 7 ? "20:00" : "21:00");
  }
  await adminQuery(
    "update public.events set status='cancelled',starts_at=starts_at+interval '1 hour' where id=$1",
    [slots[0].id],
  );
  assert.equal((await adminQuery(generate)).rows[0].added, 0);
  assert.equal((await as("service_role", null, generate)).rows[0].added, 0);
  await adminQuery(
    "insert into public.club_sources(category,title,content) values('guide','운영 자료','비공개')",
  );
  assert.equal(
    (await memberQuery("select * from public.club_sources")).rows.length,
    0,
  );
  await assert.rejects(as("anon", null, "select * from public.club_sources"));
});

test("rules contents are member-only while intake version identifiers remain available", async () => {
  const anonRules = await as("anon", null, "select * from public.rules");
  assert.equal(anonRules.rows.length, 0);
  assert.equal(
    (await as("anon", null, "select * from public.rule_versions")).rows.length,
    0,
  );
  assert.equal(
    (
      await as(
        "authenticated",
        "77777777-7777-4777-8777-777777777777",
        "select * from public.rule_versions",
      )
    ).rows.length,
    0,
  );
  assert.ok(
    (await memberQuery("select * from public.rule_versions where published"))
      .rows.length > 0,
  );
  const tokens = await as(
    "anon",
    null,
    "select public.intake_rule_versions() as versions",
  );
  assert.ok(Object.keys(tokens.rows[0].versions).length > 0);
  assert.ok(
    Object.values(tokens.rows[0].versions).every((v) => Number.isInteger(v)),
  );
  await assert.rejects(memberQuery("select public.admin_daily_guests()"));
  await assert.rejects(as("anon", null, "select public.admin_daily_guests()"));
  const days = (await adminQuery("select public.admin_daily_guests() as days"))
    .rows[0].days;
  assert.equal(days.length, 2);
  assert.ok(Array.isArray(days[0].events));
});

test("support tickets isolate owners, snapshot FAQs, target one admin and notify only the member on reply", async () => {
  const ticket = "aaaaaaaa-bbbb-4aaa-8bbb-000000000015";
  const faq = "00000000-0000-4000-8000-000000000013";
  const notifyCount = async () =>
    Number(
      (
        await db.query(
          "select count(*) n from public.notifications where href like '%/support/%'",
        )
      ).rows[0].n,
    );
  await db.query(
    "insert into public.inquiry_notification_recipients values($1)",
    [aid],
  );
  const before = await notifyCount();
  await as("service_role", null, "select public.support_view($1)", [faq]);
  assert.equal(await notifyCount(), before);
  assert.equal(
    (
      await as("anon", null, "select view_count from public.faqs where id=$1", [
        faq,
      ])
    ).rows[0].view_count,
    1,
  );
  const send = "select public.support_message($1,$2,$3,$4,$5)";
  const details = {
    category_id: "payment",
    faq_id: faq,
    name: "테스트",
    phone: "01000000000",
    member_id: mid,
    title: "테스트 문의",
  };
  await assert.rejects(
    memberQuery(send, [ticket, details, "admin", "위조", []]),
  );
  await as("service_role", null, send, [ticket, details, "member", "질문", []]);
  assert.equal(
    (
      await memberQuery("select title from public.inquiries where id=$1", [
        ticket,
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await as(
        "authenticated",
        other,
        "select id from public.inquiry_messages where inquiry_id=$1",
        [ticket],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(as("anon", null, "select id from public.inquiries"));
  assert.equal(
    (
      await db.query("select user_id from public.notifications where href=$1", [
        "/admin/support/" + ticket,
      ])
    ).rows[0].user_id,
    admin,
  );
  await as("service_role", null, send, [
    ticket,
    null,
    "admin",
    "확인했어요",
    ["one", "two", "three"],
  ]);
  await assert.rejects(
    as("service_role", null, send, [ticket, null, "member", "네", ["four"]]),
  );
  assert.equal(
    (
      await memberQuery(
        "select id from public.inquiry_messages where inquiry_id=$1",
        [ticket],
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (
      await db.query("select user_id from public.notifications where href=$1", [
        "/support/" + ticket,
      ])
    ).rows[0].user_id,
    member,
  );
  const row = (
    await db.query(
      "select status,faq_question,last_reply_at from public.inquiries where id=$1",
      [ticket],
    )
  ).rows[0];
  assert.equal(row.status, "RESOLVED");
  assert.ok(row.faq_question);
  assert.ok(row.last_reply_at);
});
