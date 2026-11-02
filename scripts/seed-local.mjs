/** Explicitly local-only. Never runs during build/deploy. No real member data. */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error("Seed refused: use a dedicated localhost Supabase instance.");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Local service role key required.");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
const users = [];
for (let i = 0; i < 5; i++) {
  const email = `${i === 0 ? "admin" : "member" + i}@example.invalid`;
  const existing = checked(await db.auth.admin.listUsers()).users.find(
    (u) => u.email === email,
  );
  const user =
    existing ||
    checked(
      await db.auth.admin.createUser({
        email,
        password: randomBytes(32).toString("hex"),
        email_confirm: true,
      }),
    ).user;
  users.push(user);
}
const members = checked(
  await db
    .from("members")
    .upsert(
      users.map((u, i) => ({
        user_id: u.id,
        external_id: `local-member-${i}`,
        name: [
          "운영진 예시",
          "세터 예시",
          "레프트 예시",
          "센터 예시",
          "리베로 예시",
        ][i],
        phone: `0100000000${i}`,
        position: ["세터", "세터", "레프트", "센터", "리베로"][i],
        experience: "2년",
        joined_on: "2026-01-01",
        status: "active",
      })),
      { onConflict: "external_id" },
    )
    .select(),
);
checked(
  await db
    .from("admins")
    .upsert({
      member_id: members.find((m) => m.user_id === users[0].id).id,
      titles: ["총무", "게스트 담당"],
    }),
);
const now = Date.now();
const events = checked(
  await db
    .from("events")
    .upsert(
      [-3, -1, 2, 4, 7, 9].map((offset, i) => ({
        external_id: `local-event-${i}`,
        title: i % 2 ? "Lesson Day" : "Game Day",
        starts_at: new Date(now + offset * 86400000).toISOString(),
        ends_at: new Date(now + offset * 86400000 + 10800000).toISOString(),
        location: "로컬 테스트 체육관",
        kind: i % 2 ? "lesson" : "game",
        description: "개발 전용 가상 일정",
        guests_open: offset > 0,
        guest_fee: i % 2 ? 15000 : 5000,
        status: offset > 0 ? "scheduled" : "completed",
      })),
      { onConflict: "external_id" },
    )
    .select(),
);
const guests = checked(
  await db
    .from("guests")
    .upsert(
      [0, 1, 2].map((i) => ({
        external_id: `local-guest-${i}`,
        name: `게스트 예시 ${i + 1}`,
        phone: `0100000001${i}`,
        position: "레프트",
      })),
      { onConflict: "external_id" },
    )
    .select(),
);
const upcoming = events.find((e) => e.status === "scheduled");
for (const [i, g] of guests.entries()) {
  const a = checked(
    await db
      .from("guest_applications")
      .upsert(
        {
          guest_id: g.id,
          event_id: upcoming.id,
          answers: {
            experience: "2년",
            source: i % 2 ? "Instagram" : "지인",
            notes: "로컬 테스트",
          },
          self_reported_paid: true,
        },
        { onConflict: "guest_id,event_id" },
      )
      .select()
      .single(),
  );
  checked(
    await db
      .from("guest_payments")
      .upsert({
        application_id: a.id,
        amount: upcoming.guest_fee,
        status: i === 0 ? "paid" : "pending",
      }),
  );
}
const past = events.find((e) => e.status === "completed");
checked(
  await db.from("event_attendance").upsert(
    members.map((m) => ({
      member_id: m.id,
      event_id: past.id,
      response: "yes",
      actual: true,
      checked_by: users[0].id,
    })),
    { onConflict: "event_id,member_id" },
  ),
);
checked(
  await db.from("event_attendance").upsert(
    members.map((m) => ({
      member_id: m.id,
      event_id: upcoming.id,
      response: "yes",
    })),
    { onConflict: "event_id,member_id" },
  ),
);
const month =
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7) + "-01";
checked(
  await db.from("membership_payments").upsert(
    members.map((m, i) => ({
      member_id: m.id,
      month,
      amount: 60000,
      status: i % 2 ? "paid" : "unpaid",
    })),
    { onConflict: "member_id,month" },
  ),
);
checked(
  await db
    .from("rules")
    .upsert(
      {
        category: "guest",
        title: "로컬 테스트 게스트 회칙",
        current_version: 1,
      },
      { onConflict: "category" },
    ),
);
const rule = checked(
  await db.from("rules").select("id").eq("category", "guest").single(),
);
checked(
  await db
    .from("rule_versions")
    .upsert(
      {
        rule_id: rule.id,
        version: 1,
        content: "개발 전용 회칙입니다. 운영 회칙으로 사용하지 마세요.",
        published: true,
      },
      { onConflict: "rule_id,version" },
    ),
);
checked(
  await db
    .from("announcements")
    .insert({
      title: "로컬 개발 테스트 공지",
      content: "가상 데이터입니다.",
      kind: "required",
      audience: "public",
    }),
);
checked(
  await db
    .from("videos")
    .insert({
      title: "개발용 YouTube 예시",
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      video_id: "aqz-KE-bpKQ",
      thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
      filmed_on: month,
      event_id: past.id,
      kind: "practice",
      visibility: "member",
    }),
);
console.log(
  "Local fixtures inserted. No production project accepted. Use local Supabase Studio to inspect accounts.",
);
