const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
function load(file) {
  file = path.resolve(file);
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
      n.startsWith(".")
        ? load(path.resolve(path.dirname(file), n + ".ts"))
        : require(n),
    module,
  );
  return module.exports;
}
const d = load("src/lib/domain.ts"),
  imp = load("src/lib/import.ts"),
  legacy = load("src/lib/legacy-import.ts");
test("phone normalization uses stable Korean phone IDs, validates malformed numbers", () => {
  for (const phone of ["010-1234-5678", "+82 10 1234 5678", "821012345678"])
    assert.equal(d.phone.parse(phone), "01012345678");
  assert.equal(d.phone.safeParse("123").success, false);
});
test("invalid calendar dates and future births are rejected", () => {
  assert.equal(d.dateOnly.safeParse("2026-02-30").success, false);
  assert.equal(d.dateOnly.safeParse("2024-02-29").success, true);
});
test("YouTube URL parser supports video, shorts, playlist and rejects foreign origins / malformed IDs", () => {
  assert.equal(
    d.parseYouTube("https://youtu.be/abcdefghijk").video_id,
    "abcdefghijk",
  );
  assert.equal(
    d.parseYouTube("https://www.youtube.com/shorts/abcdefghijk").video_id,
    "abcdefghijk",
  );
  assert.equal(
    d.parseYouTube("https://youtube.com/playlist?list=PLabcdefghijk")
      .playlist_id,
    "PLabcdefghijk",
  );
  for (const url of [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://example.com",
    "https://youtube.com/watch?v=short",
  ])
    assert.throws(() => d.parseYouTube(url));
});
test("CSV escapes spreadsheet formulas and quotes rather than executing user input", () => {
  const result = d.csvSerialize([
    {
      name: '=HYPERLINK("https://evil.test")',
      phone: "+821012345678",
      note: 'hello, "world"\nnext',
    },
  ]);
  assert.ok(result.startsWith("\uFEFF"));
  assert.ok(result.includes("'=HYPERLINK"));
  assert.ok(result.includes("'+8210"));
  assert.ok(result.includes('""world""'));
});
test("shared roster whitelist excludes phones, birth dates, private answers and admin memos", () => {
  const result = d.rosterText(
    { title: "Game Day", starts_at: "2026-11-02T10:00:00Z" },
    [
      {
        name: "회원",
        position: "센터",
        phone: "01012345678",
        birth_date: "1998-01-01",
      },
    ],
    [
      {
        name: "게스트",
        position: "세터",
        admin_memo: "비밀",
        privacy_consent: true,
      },
    ],
  );
  for (const forbidden of ["01012345678", "1998-01-01", "비밀", "privacy"])
    assert.ok(!result.includes(forbidden));
  assert.ok(result.includes("총 2명"));
});
test("Import strips privilege fields and detects duplicates / unknown statuses", () => {
  const row = {
    external_id: "x",
    name: "가상회원",
    phone: "01012345678",
    joined_on: "2026-01-01",
    status: "active",
    user_id: "forged",
    role: "admin",
  };
  let result = imp.validateImport("members", [row]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.data[0].user_id, undefined);
  assert.equal(result.data[0].role, undefined);
  assert.equal(imp.validateImport("members", [row, row]).errors.length, 1);
  assert.equal(
    imp.validateImport("members", [{ ...row, status: "admin" }]).errors.length,
    1,
  );
});
test("Import booleans do not interpret arbitrary payment or consent text as true", () => {
  assert.equal(imp.coerceImportCell("입금했습니다"), "입금했습니다");
  assert.equal(imp.coerceImportCell("false"), false);
  assert.equal(imp.coerceImportCell("true"), true);
});
test("legacy source dates require correction of impossible and weekday-conflicting values", () => {
  assert.equal(legacy.legacyDate("260503(일)"), "2026-05-03");
  assert.throws(() => legacy.legacyDate("250504(월)"));
  assert.throws(() => legacy.legacyDate("2600712(일)"));
  assert.equal(
    legacy.legacyDate("2600712(일)", { "2600712(일)": "2026-07-12" }),
    "2026-07-12",
  );
});
test("legacy source member roster splits both horizontal member groups and preserves join dates", () => {
  const rows = [
    [],
    [],
    [],
    [
      null,
      1,
      "첫회원",
      "1998-01-01",
      "01011111111",
      "2025-01-01",
      "메모",
      "",
      2,
      "두회원",
      "1999-01-01",
      "01022222222",
      "2026-01-01",
    ],
  ];
  const r = legacy.convertLegacy("회원명단", rows, "members");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].joined_on, "2025-01-01");
  assert.equal(r.rows[0].admin_memo, "메모");
  assert.notEqual(r.rows[0].external_id, r.rows[1].external_id);
});
test("legacy source name-only attendance is blocked without operator-reviewed ID mapping", () => {
  const r = legacy.convertLegacy(
    "출석원본",
    [
      ["날짜", "260503(일)"],
      ["회원", "O"],
    ],
    "event_attendance",
    {},
  );
  assert.equal(r.rows.length, 0);
  assert.equal(r.issues.length, 1);
  const verified = legacy.convertLegacy(
    "출석원본",
    [
      ["날짜", "260503(일)"],
      ["회원", "O"],
    ],
    "event_attendance",
    {
      members: { 회원: "member-id" },
      events: { "2026-05-03": "event-id" },
      attendanceMarks: { O: true },
    },
  );
  assert.equal(verified.rows[0].actual, true);
  assert.equal(verified.rows[0].response, "unanswered");
});
test("legacy horizontal dues need explicit status mapping and preserve amount/month", () => {
  const rows = [[], [], [], [], [null, null, "직책", "회원", 60000, ""]];
  const mapping = {
    members: { 회원: "member-id" },
    paymentMarks: { 60000: "paid" },
  };
  const r = legacy.convertLegacy(
    "회비납부명단(2026년)",
    rows,
    "membership_payments",
    mapping,
  );
  assert.equal(r.rows[0].amount, 60000);
  assert.equal(r.rows[0].month, "2026-01-01");
  assert.equal(r.rows[0].status, "paid");
  assert.equal(
    legacy.convertLegacy("회비납부명단(2026년)", rows, "membership_payments", {
      members: mapping.members,
    }).issues.length,
    1,
  );
});
test("xlsx export/read roundtrip preserves numbers, Korean text, multiple sheets and literal formulas", async () => {
  const { default: write } = await import("write-excel-file/node");
  const { default: read } = await import("read-excel-file/node");
  const bytes = await write([
    {
      sheet: "회원",
      data: [
        ["이름", "회비", "입금"],
        ["가상회원", 60000, true],
        ["'=1+1", 0, false],
      ],
    },
    { sheet: "일정", data: [["날짜"], ["2026-11-02"]] },
  ]).toBuffer();
  const result = await read(bytes);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].data[1], ["가상회원", 60000, true]);
  assert.equal(result[0].data[2][0], "'=1+1");
});

test("legacy timestamp conversion demands explicit timezone for ambiguous source times", () => {
  assert.throws(() => legacy.legacyTimestamp("2026. 11. 2 오후 7:30:00"));
  assert.equal(
    legacy.legacyTimestamp("2026. 11. 2 오후 7:30:00", "+09:00"),
    "2026-11-02T10:30:00.000Z",
  );
  assert.equal(
    legacy.legacyTimestamp("2026-11-02T19:30:00+09:00"),
    "2026-11-02T10:30:00.000Z",
  );
});
test("legacy rules conversion retains all categories, continuation rows, refund and fee content", () => {
  const r = legacy.convertLegacy(
    "스포트라이트 회칙",
    [
      ["2026.10.28. 수정"],
      [],
      [null, "회원", "회원내용"],
      [null, "회비", "60000"],
      [null, null, "제출기간"],
      [null, "게스트 환불", "전날 전액 환불"],
      [null, "사진 및 영상", "단독 촬영 삭제 안내"],
    ],
    "rules",
  );
  assert.equal(r.rows.length, 4);
  assert.ok(
    r.rows.find((r) => r.category === "회비").content.includes("제출기간"),
  );
  assert.ok(
    r.rows
      .find((r) => r.category === "게스트 환불")
      .content.includes("전날 전액 환불"),
  );
});

test("KST month bounds handle 30/31-day transitions and year end without overflowing into next month", () => {
  assert.deepEqual(d.monthBounds("2026-11"), {
    start: "2026-10-31T15:00:00.000Z",
    end: "2026-11-30T15:00:00.000Z",
  });
  assert.deepEqual(d.monthBounds("2026-12"), {
    start: "2026-11-30T15:00:00.000Z",
    end: "2026-12-31T15:00:00.000Z",
  });
  assert.throws(() => d.monthBounds("2026-13"));
});

test("announcement priority does not mutate input, emergency appears before newer general/required/event notices", () => {
  const rows = [
    { id: "general", kind: "general", created_at: "2030-01-04" },
    { id: "event", kind: "event", created_at: "2030-01-03" },
    { id: "required", kind: "required", created_at: "2030-01-02" },
    { id: "urgent", kind: "emergency", created_at: "2020-01-01" },
  ];
  assert.deepEqual(
    d.sortAnnouncements(rows).map((n) => n.id),
    ["urgent", "required", "event", "general"],
  );
  assert.equal(rows[0].id, "general");
  assert.deepEqual(d.noticeVersions([{ id: "a", version: 3 }]), { a: 3 });
});
test("notice publishing windows compare actual instants across UTC/KST offsets", () => {
  const base = {
    title: "공지",
    content: "내용",
    kind: "general",
    audience: "public",
    starts_at: "2030-01-01T19:00:00+09:00",
  };
  assert.equal(
    d.noticeSchema.safeParse({ ...base, ends_at: "2030-01-01T10:30:00Z" })
      .success,
    true,
  );
  assert.equal(
    d.noticeSchema.safeParse({ ...base, ends_at: "2030-01-01T10:00:00Z" })
      .success,
    false,
  );
});
test("guest availability excludes cancelled, completed and holiday events while emergency changes require a reason", () => {
  const base = {
    title: "운동",
    starts_at: "2099-01-01T10:00:00Z",
    ends_at: "2099-01-01T13:00:00Z",
    location: "체육관",
    kind: "game",
    guests_open: true,
    guest_fee: 5000,
    status: "scheduled",
  };
  assert.equal(d.canApplyAsGuest(base), true);
  for (const patch of [
    { kind: "holiday" },
    { status: "cancelled" },
    { status: "completed" },
    { guests_open: false },
  ])
    assert.equal(d.canApplyAsGuest({ ...base, ...patch }), false);
  assert.equal(
    d.eventSchema.safeParse({ ...base, is_emergency: true, change_reason: "" })
      .success,
    false,
  );
  assert.equal(
    d.eventSchema.safeParse({
      ...base,
      is_emergency: true,
      change_reason: "체육관 변경",
    }).success,
    true,
  );
});

test("archive metadata normalizes playlists, uses only approved YouTube covers and validates counts", () => {
  const p = d.archiveMetadata(
    "https://www.youtube.com/watch?v=abcdefghijk&list=PLabcdefghijk",
    "https://youtu.be/0123456789_",
    true,
  );
  assert.equal(p.video_id, null);
  assert.equal(p.url, "https://www.youtube.com/playlist?list=PLabcdefghijk");
  assert.equal(p.thumbnail, "https://i.ytimg.com/vi/0123456789_/hqdefault.jpg");
  assert.throws(() =>
    d.archiveMetadata("https://youtu.be/abcdefghijk", "", true),
  );
  assert.throws(() =>
    d.archiveMetadata(
      "https://youtube.com/playlist?list=PLabcdefghijk",
      "https://evil.invalid/cover.png",
      true,
    ),
  );
  assert.throws(() =>
    d.archiveInput.parse({
      title: "목록",
      url: p.url,
      filmed_on: "2026-11-02",
      kind: "game",
      event_id: null,
      video_count: -1,
    }),
  );
});
