import { exportData } from "@/lib/admin-export";
import { z } from "zod";
import { canReceiveNotification } from "@/lib/notification-policy";
import { after } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  serverClient,
  serviceClient,
  configured,
  identity,
  HttpError,
} from "@/lib/supabase/server";
import {
  membershipSchema,
  guestSchema,
  questionSchema,
  eventSchema,
  noticeSchema,
  uuid,
  phone,
  cleanText,
  dateOnly,
  parseYouTube,
  archiveInput,
  archiveMetadata,
  csvSerialize,
  safeSpreadsheetCell,
  seoulDate,
  rosterText,
  monthBounds,
  sortAnnouncements,
} from "@/lib/domain";
import { validateImport, importColumns, type ImportEntity } from "@/lib/import";
import { deliverPush, isPushEndpoint } from "@/lib/push";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 8_000_000)
    throw new HttpError(413, "파일이 너무 큽니다.");
  const text = await request.text();
  if (text.length > 8_000_000) throw new HttpError(413, "요청이 너무 큽니다.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "입력 형식을 확인해주세요.");
  }
}
function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "요청 출처를 확인할 수 없습니다.");
}
function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function processRequest(request: Request, segments: string[]) {
  const path = segments.join("/");
  const method = request.method;
  const url = new URL(request.url);
  if (path === "cron" && method === "GET") {
    if (
      !process.env.CRON_SECRET ||
      !secureEqual(
        request.headers.get("authorization") || "",
        `Bearer ${process.env.CRON_SECRET}`,
      )
    )
      throw new HttpError(401, "인증이 필요합니다.");
    const db = serviceClient();
    checked(await db.rpc("daily_notifications"));
    const push = await deliverPush();
    const extended = checked(await db.rpc("extend_regular_schedule"));
    return json({ ok: true, push, extended });
  }
  if (method !== "GET") sameOrigin(request);
  if (path === "bootstrap" && method === "GET" && !configured())
    return json({
      configured: false,
      role: "guest",
      user: null,
      member: null,
      events: [],
      announcements: [],
      rules: [],
      questions: [],
      bank: bankInfo(),
      acceptingApplications: false,
    });
  const db = await serverClient();
  const who = await identity(db);
  const requireUser = () => {
    if (!who.user) throw new HttpError(401, "로그인이 필요합니다.");
  };
  const requireMember = () => {
    requireUser();
    if (!who.member)
      throw new HttpError(403, "회원 승인 후 이용할 수 있습니다.");
  };
  const requireAdmin = () => {
    requireMember();
    if (!who.admin) throw new HttpError(403, "운영진만 이용할 수 있습니다.");
  };
  const data = method === "GET" ? {} : await body(request);
  if (path === "bootstrap" && method === "GET") {
    const start = new Date();
    start.setDate(start.getDate() - 45);
    const end = new Date();
    end.setDate(end.getDate() + 120);
    const results = await Promise.all([
      db
        .from("events")
        .select("*")
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString())
        .neq("status", "deleted")
        .order("starts_at")
        .limit(100),
      db
        .from("announcements")
        .select("*")
        .is("deleted_at", null)
        .lte("starts_at", new Date().toISOString())
        .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
        .order("priority")
        .order("created_at", { ascending: false })
        .limit(40),
      who.member
        ? db.from("rules").select("*,rule_versions(*)").order("category")
        : Promise.resolve({ data: [], error: null }),
      db
        .from("form_questions")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
      db
        .from("schedule_kinds")
        .select("key,label,color")
        .order("sort_order")
        .order("label"),
    ]);
    const [events, announcements, rules, questions] = results
      .slice(0, 4)
      .map(checked);
    const catalog = results[4];
    const scheduleKinds =
      catalog.error && ["42P01", "PGRST205"].includes(catalog.error.code)
        ? undefined
        : checked(catalog);
    let avatar_url = null;
    if (who.member?.avatar_path) {
      const signed = await db.storage
        .from("avatars")
        .createSignedUrl(who.member.avatar_path, 300);
      avatar_url = signed.data?.signedUrl;
    }
    const application =
      who.user && !who.member
        ? checked(
            await db
              .from("member_applications")
              .select("id,status,submitted_at,review_note,reviewed_at")
              .eq("user_id", who.user.id)
              .maybeSingle(),
          )
        : null;
    return json({
      configured: true,
      scheduleKinds,
      intakeRuleVersions: who.member
        ? undefined
        : checked(await db.rpc("intake_rule_versions")),
      role: who.admin ? "admin" : who.member ? "member" : "guest",
      user: who.user ? { id: who.user.id, email: who.user.email } : null,
      member: who.member ? { ...who.member, avatar_url } : null,
      titles: who.titles,
      application,
      events,
      announcements,
      rules,
      questions,
      bank: bankInfo(),
      acceptingApplications: Boolean(
        process.env.PRIVACY_POLICY_TEXT &&
        process.env.PRIVACY_RETENTION_DAYS &&
        process.env.PRIVACY_CONTACT &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      privacy: {
        text: process.env.PRIVACY_POLICY_TEXT || "",
        retentionDays: process.env.PRIVACY_RETENTION_DAYS || "",
        contact: process.env.PRIVACY_CONTACT || "",
      },
    });
  }
  if (path === "guest-applications" && method === "POST") {
    if (
      !process.env.PRIVACY_POLICY_TEXT ||
      !process.env.PRIVACY_RETENTION_DAYS ||
      !process.env.PRIVACY_CONTACT
    )
      throw new HttpError(
        503,
        "개인정보 처리 안내가 아직 설정되지 않았습니다. 운영진에게 문의해주세요.",
      );
    const input = guestSchema.parse(data);
    await validateExtra(db, "guest", input.extra_answers);
    // Vercel overwrites x-vercel-forwarded-for; local deployments must configure a trusted proxy.
    const ip = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ||
        "unknown"
      : request.headers.get("x-real-ip") || "local";
    const rateKey = createHash("sha256")
      .update(
        `${process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY}:${ip}:${seoulDate()}`,
      )
      .digest("hex");
    const svc = serviceClient();
    const confirmation = checked(
      await svc.rpc("submit_guest_receipt", {
        p_data: {
          ...input,
          consent_context: {
            privacy_text: process.env.PRIVACY_POLICY_TEXT,
            retention_days: process.env.PRIVACY_RETENTION_DAYS,
            contact: process.env.PRIVACY_CONTACT,
            photo_text: "활동 사진·영상이 동호회 기록 및 홍보에 활용됩니다.",
          },
        },
        p_rate_key: rateKey,
      }),
    );
    after(async () => {
      await deliverPush().catch(() => {});
    });
    return json(
      {
        ...confirmation,
        bank: bankInfo(),
        depositor_name: input.name,
        message:
          "신청이 접수되었습니다. 운영진 입금 확인 후 참가가 확정됩니다.",
      },
      201,
    );
  }
  if (path === "membership" && method === "POST") {
    requireUser();
    if (
      !process.env.PRIVACY_POLICY_TEXT ||
      !process.env.PRIVACY_RETENTION_DAYS ||
      !process.env.PRIVACY_CONTACT
    )
      throw new HttpError(
        503,
        "개인정보 처리 안내가 아직 설정되지 않았습니다.",
      );
    const input = membershipSchema.parse(data);
    await validateExtra(db, "member", input.extra_answers);
    const id = checked(
      await db.rpc("submit_membership", {
        p_data: {
          ...input,
          consent_context: {
            privacy_text: process.env.PRIVACY_POLICY_TEXT,
            retention_days: process.env.PRIVACY_RETENTION_DAYS,
            contact: process.env.PRIVACY_CONTACT,
            photo_text: "활동 사진·영상이 동호회 기록 및 홍보에 활용됩니다.",
          },
        },
      }),
    );
    after(async () => {
      await deliverPush().catch(() => {});
    });
    return json({ id }, 201);
  }
  if (path === "notices" && method === "GET") {
    const kind = z
      .enum(["all", "general", "required", "event", "emergency"])
      .parse(url.searchParams.get("kind") || "all");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(url.searchParams.get("page") || 0);
    let q = visibleNotices(db);
    if (kind !== "all") q = q.eq("kind", kind);
    const result = await q.range(page * 20, page * 20 + 19);
    return json({ rows: checked(result), total: result.count });
  }
  if (path === "guest-guidance" && method === "GET") {
    const eventId = url.searchParams.get("event");
    const event = eventId
      ? checked(
          await db
            .from("events")
            .select("*")
            .eq("id", uuid.parse(eventId))
            .neq("status", "deleted")
            .single(),
        )
      : null;
    const [mandatory, recent] = await Promise.all([
      visibleNotices(db)
        .eq("audience", "public")
        .in("kind", ["required", "emergency"])
        .limit(1000),
      visibleNotices(db)
        .eq("audience", "public")
        .in("kind", ["general", "event"])
        .limit(10),
    ]);
    const required = checked(mandatory) || [];
    if ((mandatory.count || 0) > required.length)
      throw new HttpError(
        503,
        "참가 안내를 모두 불러오지 못했습니다. 운영진에게 문의해주세요.",
      );
    return json({
      event,
      announcements: sortAnnouncements([
        ...required,
        ...(checked(recent) || []),
      ]),
    });
  }
  if (path === "events" && method === "GET") {
    const month = z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .parse(url.searchParams.get("month"));
    const bounds = monthBounds(month);
    const start = new Date(bounds.start),
      end = new Date(bounds.end);
    return json(
      checked(
        await db
          .from("events")
          .select("*")
          .gte("starts_at", start.toISOString())
          .lt("starts_at", end.toISOString())
          .neq("status", "deleted")
          .order("starts_at")
          .limit(200),
      ),
    );
  }
  if (segments[0] === "events" && segments[1] && method === "GET") {
    const id = uuid.parse(segments[1]);
    const event = checked(
      await db
        .from("events")
        .select("*")
        .eq("id", id)
        .neq("status", "deleted")
        .single(),
    );
    const counts = who.member
      ? checked(await db.rpc("event_counts", { p_event: id }))
      : null;
    const guestSummary = who.admin
      ? checked(await db.rpc("admin_guest_counts", { p_event: id }))
      : null;
    const response = who.member
      ? checked(
          await db
            .from("event_attendance")
            .select("response")
            .eq("event_id", id)
            .eq("member_id", who.member.id)
            .maybeSingle(),
        )
      : null;
    const videos = who.member
      ? checked(
          await db
            .from("video_archive")
            .select("*")
            .eq("event_id", id)
            .limit(50),
        )
      : [];
    return json({
      event,
      counts: counts
        ? {
            members: counts.members,
            guests: counts.guests,
            total: counts.total,
          }
        : null,
      ...(who.admin ? { guest_summary: guestSummary } : {}),
      response: response?.response || "unanswered",
      videos,
    });
  }
  if (path === "rsvp" && method === "POST") {
    requireMember();
    const input = z
      .object({ event_id: uuid, response: z.enum(["yes", "no", "unanswered"]) })
      .parse(data);
    checked(
      await db.rpc("respond_event", {
        p_event: input.event_id,
        p_response: input.response,
      }),
    );
    return json({ ok: true });
  }
  if (path === "me" && method === "GET") {
    requireMember();
    const m = who.member!.id;
    const [attendance, payments, uniform, summary] = await Promise.all([
      db
        .from("event_attendance")
        .select("*,events(title,starts_at,ends_at,kind,status)")
        .eq("member_id", m)
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("membership_payments")
        .select("*")
        .eq("member_id", m)
        .order("month", { ascending: false })
        .limit(120),
      db.from("uniforms").select("*").eq("member_id", m).maybeSingle(),
      db.rpc("my_activity_summary"),
    ]);
    return json({
      attendance: checked(attendance),
      payments: checked(payments),
      uniform: checked(uniform),
      summary: checked(summary),
    });
  }
  if (path === "my-attendance" && method === "GET") {
    requireMember();
    const { year, page } = attendanceRange(url);
    return json(
      checked(
        await db.rpc("my_attendance_report", { p_year: year, p_page: page }),
      ),
    );
  }
  if (path === "profile" && method === "PATCH") {
    requireMember();
    const input = z
      .object({
        name: cleanText(80).min(1).optional(),
        phone,
        position: cleanText(80),
        experience: cleanText(200),
        avatar_path: z.string().max(500).nullable().optional(),
      })
      .parse(data);
    checked(await db.rpc("update_my_profile", { p_data: input }));
    return json({ ok: true });
  }
  if (path === "avatar" && method === "POST") {
    requireMember();
    const input = z
      .object({
        content: z.string().max(7_000_000),
        type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      })
      .parse(data);
    const bytes = Buffer.from(input.content, "base64");
    if (bytes.length > 5_242_880)
      throw new HttpError(413, "5MB 이하의 사진을 선택해주세요.");
    const valid =
      input.type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : input.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) throw new HttpError(400, "사진 파일 형식을 확인해주세요.");
    const path = `${who.user!.id}/${crypto.randomUUID()}.${input.type.split("/")[1]}`;
    checked(
      await db.storage
        .from("avatars")
        .upload(path, bytes, { contentType: input.type, upsert: false }),
    );
    try {
      checked(await db.rpc("set_my_avatar", { p_path: path }));
    } catch (e) {
      await db.storage.from("avatars").remove([path]);
      throw e;
    }
    if (who.member!.avatar_path)
      await db.storage.from("avatars").remove([who.member!.avatar_path]);
    return json({ path });
  }
  if (path === "avatar" && method === "DELETE") {
    requireMember();
    const old = who.member!.avatar_path;
    checked(await db.rpc("set_my_avatar", { p_path: null }));
    if (old) checked(await db.storage.from("avatars").remove([old]));
    return json({ ok: true });
  }
  if (path === "name-requests" && method === "GET") {
    requireMember();
    return json(
      checked(
        await db
          .from("member_name_requests")
          .select("*")
          .eq("member_id", who.member!.id)
          .order("submitted_at", { ascending: false })
          .limit(20),
      ),
    );
  }
  if (path === "name-requests" && method === "POST") {
    requireMember();
    const input = z
      .object({
        name: cleanText(80).min(1),
        reason: cleanText(1000).default(""),
      })
      .parse(data);
    const id = checked(
      await db.rpc("request_member_name", {
        p_name: input.name,
        p_reason: input.reason,
      }),
    );
    after(async () => {
      await deliverPush().catch(() => {});
    });
    return json({ id }, 201);
  }
  if (path === "notifications" && method === "GET") {
    requireMember();
    const rows =
      checked(
        await db
          .from("notifications")
          .select("*")
          .eq("user_id", who.user!.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ) || [];
    return json(
      rows.filter(
        (n) =>
          n.user_id === who.user!.id &&
          canReceiveNotification(who.admin ? "admin" : "member", n),
      ),
    );
  }
  if (path === "notifications/read" && method === "POST") {
    requireMember();
    checked(
      await db.rpc("mark_notification_read", { p_id: uuid.parse(data.id) }),
    );
    return json({ ok: true });
  }
  if (path === "push" && method === "POST") {
    requireMember();
    const input = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(1).max(200),
          auth: z.string().min(1).max(200),
        }),
      })
      .parse(data);
    if (!isPushEndpoint(input.endpoint))
      throw new HttpError(400, "지원하지 않는 알림 서비스입니다.");
    checked(
      await db.rpc("save_push", {
        p_endpoint: input.endpoint,
        p_p256dh: input.keys.p256dh,
        p_auth: input.keys.auth,
      }),
    );
    return json({ ok: true });
  }
  if (path === "videos" && method === "GET") {
    requireMember();
    let q = db
      .from("video_archive")
      .select("*", { count: "exact" })
      .order("filmed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("source")
      .order("id");
    const kind = url.searchParams.get("kind");
    if (kind && kind !== "all")
      q = q.eq(
        "kind",
        z.enum(["game", "lesson", "match", "practice", "event"]).parse(kind),
      );
    const year = url.searchParams.get("year");
    const month = url.searchParams.get("month");
    if (month && !year) throw new HttpError(400, "연도를 먼저 선택해주세요.");
    if (year) {
      z.string()
        .regex(/^(19|20|21)\d{2}$/)
        .parse(year);
      if (month)
        z.string()
          .regex(/^(0[1-9]|1[0-2])$/)
          .parse(month);
      q = q
        .gte(
          "filmed_on",
          `${year}-${month && /^\d{2}$/.test(month) ? month : "01"}-01`,
        )
        .lte(
          "filmed_on",
          `${year}-${month && /^\d{2}$/.test(month) ? month : "12"}-${month ? new Date(Number(year), Number(month), 0).getDate() : "31"}`,
        );
    }
    const search = url.searchParams.get("q");
    if (search) {
      const term = search.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 100);
      q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const event = url.searchParams.get("event");
    if (event) q = q.eq("event_id", uuid.parse(event));
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(url.searchParams.get("page") || 0);
    const result = await q.range(page * 24, page * 24 + 23);
    return json({ rows: checked(result), total: result.count });
  }
  if (
    segments.length === 2 &&
    ["videos", "playlists"].includes(segments[0]) &&
    method === "GET"
  ) {
    requireMember();
    const entry = checked(
      await db
        .from("video_archive")
        .select("*")
        .eq("id", uuid.parse(segments[1]))
        .eq("source", segments[0])
        .single(),
    );
    const event = entry.event_id
      ? checked(
          await db
            .from("events")
            .select("id,title,starts_at,ends_at,kind,location")
            .eq("id", entry.event_id)
            .neq("status", "deleted")
            .maybeSingle(),
        )
      : null;
    return json({ entry, event });
  }
  if (!path.startsWith("admin/"))
    throw new HttpError(404, "화면을 찾을 수 없습니다.");
  requireAdmin();
  if (path === "admin/dashboard" && method === "GET") {
    const event = url.searchParams.get("event");
    return json(
      checked(
        await db.rpc("admin_dashboard", {
          p_event: event ? uuid.parse(event) : null,
        }),
      ),
    );
  }
  if (path === "admin/attendance-report" && method === "GET") {
    const { year, page } = attendanceRange(url);
    return json(
      checked(
        await db.rpc("admin_attendance_report", {
          p_member: uuid.parse(url.searchParams.get("member")),
          p_year: year,
          p_page: page,
        }),
      ),
    );
  }
  if (path === "admin/dues-summary" && method === "GET") {
    const month = url.searchParams.get("month") || seoulDate().slice(0, 7);
    monthBounds(month);
    const member = url.searchParams.get("member");
    return json(
      checked(
        await db.rpc("admin_dues_summary", {
          p_month: `${month}-01`,
          p_member: member ? uuid.parse(member) : null,
        }),
      ),
    );
  }
  if (path === "admin/name-requests" && method === "GET")
    return json(
      checked(
        await db
          .from("member_name_requests")
          .select("*,members(id,name)")
          .eq("status", "pending")
          .order("submitted_at"),
      ),
    );
  if (path === "admin/name-requests/review" && method === "POST") {
    const input = z
      .object({
        id: uuid,
        status: z.enum(["approved", "rejected"]),
        note: cleanText(1000).default(""),
      })
      .parse(data);
    checked(
      await db.rpc("review_member_name", {
        p_request: input.id,
        p_status: input.status,
        p_note: input.note,
      }),
    );
    after(async () => {
      await deliverPush().catch(() => {});
    });
    return json({ ok: true });
  }
  if (path === "admin/daily-guests" && method === "GET")
    return json(checked(await db.rpc("admin_daily_guests")));
  if (path === "admin/guests" && method === "GET") {
    let q = db
      .from("guest_applications")
      .select(
        "*,guests(id,name,phone,position,created_at),guest_payments!inner(*),events(id,title,starts_at,ends_at,status)",
        { count: "exact" },
      )
      .order("submitted_at", { ascending: false });
    q = applyFilters(q, url, "submitted_at");
    const status = url.searchParams.get("status");
    if (status && status !== "all")
      q = q.eq(
        "guest_payments.status",
        z.enum(["paid", "pending"]).parse(status),
      );
    const event = url.searchParams.get("event");
    if (event) q = q.eq("event_id", uuid.parse(event));
    const page = Math.max(0, Number(url.searchParams.get("page") || 0));
    const result = await q.range(page * 30, page * 30 + 29);
    const summary = checked(
      await db.rpc("admin_guest_counts", {
        p_event: event ? uuid.parse(event) : null,
        p_from: url.searchParams.get("from")
          ? dateOnly.parse(url.searchParams.get("from"))
          : null,
        p_to: url.searchParams.get("to")
          ? dateOnly.parse(url.searchParams.get("to"))
          : null,
      }),
    );
    return json({ rows: checked(result), total: result.count, summary });
  }
  if (
    segments.length === 3 &&
    segments[0] === "admin" &&
    segments[1] === "guests" &&
    method === "GET"
  ) {
    const id = uuid.parse(segments[2]);
    const application = checked(
      await db
        .from("guest_applications")
        .select(
          "*,guests(id,name,phone,position,created_at),guest_payments(*),events(id,title,starts_at,ends_at,status)",
        )
        .eq("id", id)
        .single(),
    );
    if (!application) throw new HttpError(404, "신청을 찾을 수 없습니다.");
    return json(application);
  }
  if (path === "admin/payments/confirm" && method === "POST") {
    checked(
      await db.rpc("confirm_guest_payment", {
        p_application: uuid.parse(data.application_id),
      }),
    );
    return json({ ok: true });
  }
  if (
    segments.length === 4 &&
    segments[0] === "admin" &&
    segments[1] === "guests" &&
    segments[3] === "history" &&
    method === "GET"
  )
    return json(
      checked(
        await db.rpc("admin_guest_history", {
          p_guest: uuid.parse(segments[2]),
        }),
      ),
    );
  if (path === "admin/guests/attendance" && method === "POST") {
    const input = z
      .object({ application_id: uuid, actual: z.boolean() })
      .parse(data);
    checked(
      await db.rpc("check_guest_attendance", {
        p_application: input.application_id,
        p_actual: input.actual,
      }),
    );
    return json({ ok: true });
  }
  if (path === "admin/members" && method === "GET") {
    let q = db
      .from("members")
      .select("*,admins(titles),member_notes(admin_memo),uniforms(*)", {
        count: "exact",
      })
      .order("name");
    const status = url.searchParams.get("status");
    if (status && status !== "all")
      q = q.eq(
        "status",
        z.enum(["active", "inactive", "withdrawn"]).parse(status),
      );
    const search = url.searchParams.get("q");
    if (search)
      q = q.ilike("name", `%${search.replace(/[%_]/g, "").slice(0, 80)}%`);
    const result = await q.range(
      Math.max(0, Number(url.searchParams.get("page") || 0)) * 30,
      Math.max(0, Number(url.searchParams.get("page") || 0)) * 30 + 29,
    );
    return json({
      rows: await signAvatars(db, checked(result) || []),
      total: result.count,
    });
  }
  if (path === "admin/applications" && method === "GET")
    return json(
      checked(
        await db
          .from("member_applications")
          .select("*")
          .neq("status", "approved")
          .order("submitted_at", { ascending: false })
          .limit(200),
      ),
    );
  if (path === "admin/applications/review" && method === "POST") {
    const input = z
      .object({
        id: uuid,
        status: z.enum(["approved", "hold", "rejected"]),
        member_id: uuid.nullable().default(null),
        note: cleanText(1000).default(""),
      })
      .parse(data);
    checked(
      await db.rpc("review_membership_with_note", {
        p_application: input.id,
        p_status: input.status,
        p_member: input.member_id,
        p_note: input.note,
      }),
    );
    return json({ ok: true });
  }
  if (path === "admin/members" && method === "PATCH") {
    const input = z
      .object({
        id: uuid,
        name: cleanText(80).min(1),
        phone,
        birth_date: dateOnly.nullable(),
        position: cleanText(80),
        experience: cleanText(200),
        status: z.enum(["active", "inactive", "withdrawn"]),
        admin_memo: cleanText(5000),
      })
      .parse(data);
    const { id, admin_memo, ...profile } = input;
    if (id === who.member!.id && profile.status !== "active")
      throw new HttpError(400, "본인 계정을 비활성화할 수 없습니다.");
    checked(
      await db.rpc("admin_update_member", {
        p_id: id,
        p_profile: profile,
        p_memo: admin_memo,
      }),
    );
    return json({ ok: true });
  }
  if (
    segments[0] === "admin" &&
    segments[1] === "member" &&
    segments[2] &&
    method === "GET"
  ) {
    const id = uuid.parse(segments[2]);
    const member = checked(
      await db
        .from("members")
        .select("*,admins(titles),member_notes(admin_memo),uniforms(*)")
        .eq("id", id)
        .single(),
    );
    if (!member) throw new HttpError(404, "회원을 찾을 수 없습니다.");
    const summary = checked(
      await db.rpc("admin_member_summary", { p_member: id }),
    );
    let avatar_url = null;
    if (member.avatar_path)
      avatar_url = (
        await db.storage
          .from("avatars")
          .createSignedUrl(member.avatar_path, 300)
      ).data?.signedUrl;
    return json({
      ...member,
      avatar_url,
      ...summary,
    });
  }
  if (path === "admin/avatar" && method === "POST") {
    const input = z
      .object({
        member_id: uuid,
        content: z.string().max(7_000_000),
        type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      })
      .parse(data);
    const bytes = Buffer.from(input.content, "base64");
    if (bytes.length > 5242880)
      throw new HttpError(413, "5MB 이하의 사진을 선택해주세요.");
    const valid =
      input.type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : input.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) throw new HttpError(400, "사진 형식을 확인해주세요.");
    const member = checked(
      await db
        .from("members")
        .select("avatar_path")
        .eq("id", input.member_id)
        .single(),
    );
    const path = `managed/${input.member_id}/${crypto.randomUUID()}.${input.type.split("/")[1]}`;
    checked(
      await db.storage
        .from("avatars")
        .upload(path, bytes, { contentType: input.type }),
    );
    try {
      checked(
        await db.rpc("admin_set_avatar", {
          p_member: input.member_id,
          p_path: path,
        }),
      );
    } catch (e) {
      await db.storage.from("avatars").remove([path]);
      throw e;
    }
    if (member?.avatar_path)
      await db.storage.from("avatars").remove([member.avatar_path]);
    return json({ ok: true });
  }
  if (path === "admin/avatar" && method === "DELETE") {
    const id = uuid.parse(data.member_id);
    const member = checked(
      await db.from("members").select("avatar_path").eq("id", id).single(),
    );
    checked(await db.rpc("admin_set_avatar", { p_member: id, p_path: null }));
    if (member?.avatar_path)
      checked(await db.storage.from("avatars").remove([member.avatar_path]));
    return json({ ok: true });
  }
  if (path === "admin/roles" && method === "POST") {
    const input = z
      .object({
        member_id: uuid,
        titles: z.array(cleanText(80).min(1)).max(10),
      })
      .parse(data);
    if (input.member_id === who.member!.id)
      throw new HttpError(
        400,
        "본인의 관리자 권한은 다른 관리자가 변경해야 합니다.",
      );
    if (input.titles.length)
      checked(
        await db
          .from("admins")
          .upsert({ ...input, titles: [...new Set(input.titles)] }),
      );
    else
      checked(
        await db.from("admins").delete().eq("member_id", input.member_id),
      );
    return json({ ok: true });
  }
  if (path === "admin/attendance" && method === "GET") {
    const result = checked(
      await db.rpc("admin_event_attendance", {
        p_event: uuid.parse(url.searchParams.get("event")),
        p_response: z
          .enum(["all", "yes", "no", "unanswered"])
          .parse(url.searchParams.get("response") || "all"),
        p_page: attendanceRange(url).page,
      }),
    );
    return json({
      ...result,
      members: await signAvatars(db, result.members || []),
    });
  }
  if (path === "admin/attendance" && method === "POST") {
    const input = z
      .object({ event_id: uuid, member_id: uuid, actual: z.boolean() })
      .parse(data);
    checked(
      await db.rpc("check_attendance", {
        p_event: input.event_id,
        p_member: input.member_id,
        p_actual: input.actual,
      }),
    );
    return json({ ok: true });
  }
  if (path === "admin/dues" && method === "GET") {
    const month = z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .parse(url.searchParams.get("month") || seoulDate().slice(0, 7));
    monthBounds(month);
    let q = db
      .from("membership_payments")
      .select("*,members(id,name,position)")
      .eq("month", `${month}-01`)
      .order("status");
    const status = url.searchParams.get("status");
    if (status && status !== "all")
      q = q.eq("status", z.enum(["paid", "unpaid", "exempt"]).parse(status));
    const member = url.searchParams.get("member");
    if (member) q = q.eq("member_id", uuid.parse(member));
    return json(checked(await q.limit(1000)));
  }
  if (path === "admin/dues" && method === "POST") {
    const input = z
      .object({
        member_id: uuid,
        month: dateOnly.refine((v) => v.endsWith("-01")),
        amount: z.number().int().nonnegative(),
        status: z.enum(["paid", "unpaid", "exempt"]),
      })
      .parse(data);
    checked(
      await db
        .from("membership_payments")
        .upsert(
          { ...input, verified_by: who.user!.id },
          { onConflict: "member_id,month" },
        ),
    );
    return json({ ok: true });
  }
  if (path === "admin/uniforms" && method === "GET")
    return json(
      checked(await db.from("uniforms").select("*,members(name)").limit(1000)),
    );
  if (path === "admin/uniforms" && method === "POST") {
    const input = z
      .object({
        member_id: uuid,
        nickname: cleanText(80),
        number: cleanText(20),
        top_size: cleanText(40),
        bottom_size: cleanText(40),
      })
      .parse(data);
    checked(await db.from("uniforms").upsert(input));
    return json({ ok: true });
  }
  if (path === "admin/roster" && method === "GET") {
    const eventId = uuid.parse(url.searchParams.get("event"));
    const result = checked(await db.rpc("admin_roster", { p_event: eventId }));
    const safe = (rows: any[]) =>
      rows.map((r) => ({
        name: String(r.name || ""),
        position: String(r.position || ""),
      }));
    const members = safe(result.members || []),
      guests = safe(result.guests || []);
    return json({
      event: result.event,
      members,
      guests,
      counts: {
        members: members.length,
        guests: guests.length,
        total: members.length + guests.length,
      },
      text: rosterText(result.event, members, guests),
    });
  }
  if (path === "admin/analytics" && method === "GET") {
    return json(
      checked(
        await db.rpc("club_analytics", {
          p_month:
            (url.searchParams.get("month") || seoulDate().slice(0, 7)) + "-01",
        }),
      ),
    );
  }
  if (path === "admin/regular-schedule" && method === "POST")
    return json({ added: checked(await db.rpc("extend_regular_schedule")) });
  if (
    path === "admin/schedule-kinds" &&
    (method === "POST" || method === "PATCH")
  ) {
    const item = z
      .object({
        label: z.string().trim().min(1).max(50),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
      })
      .parse(data);
    if (method === "POST")
      checked(
        await db.from("schedule_kinds").insert({
          ...item,
          key: "custom_" + crypto.randomUUID().replaceAll("-", ""),
        }),
      );
    else
      checked(
        await db
          .from("schedule_kinds")
          .update(item)
          .eq("key", z.string().min(1).max(64).parse(data.key))
          .select("key")
          .single(),
      );
    return json({ ok: true });
  }
  if (path === "admin/sources" && method === "GET")
    return json(
      checked(
        await db
          .from("club_sources")
          .select("category,title,content,url")
          .order("created_at", { ascending: false }),
      ),
    );
  if (path === "admin/sources" && method === "POST") {
    const items = z
      .array(
        z
          .object({
            category: z.enum(["form", "guide", "instagram", "sheet"]),
            title: z.string().trim().min(1).max(150),
            content: z.string().trim().max(20000),
            url: z.union([z.literal(""), z.url().regex(/^https:\/\//i)]),
          })
          .refine(
            (r) => Boolean(r.url || r.content),
            "내용이나 주소가 필요합니다.",
          ),
      )
      .min(1)
      .max(100)
      .parse(data.rows);
    checked(
      await db
        .from("club_sources")
        .upsert(items, { onConflict: "category,title" }),
    );
    return json({ ok: true });
  }
  if (path === "admin/events" && (method === "POST" || method === "PATCH")) {
    const input = eventSchema.parse(data);
    if (method === "PATCH")
      checked(
        await db
          .from("events")
          .update(input)
          .eq("id", uuid.parse(data.id))
          .select("id")
          .single(),
      );
    else checked(await db.from("events").insert(input));
    return json({ ok: true });
  }
  if (path === "admin/notices" && (method === "POST" || method === "PATCH")) {
    const input = noticeSchema.parse(data);
    if (method === "PATCH")
      checked(
        await db
          .from("announcements")
          .update({ ...input, updated_at: new Date().toISOString() })
          .eq("id", uuid.parse(data.id))
          .is("deleted_at", null)
          .select("id")
          .single(),
      );
    else
      checked(
        await db
          .from("announcements")
          .insert({ ...input, created_by: who.user!.id }),
      );
    checked(await db.rpc("publish_emergencies"));
    after(async () => {
      await deliverPush().catch(() => {});
    });
    return json({ ok: true });
  }
  if (path === "admin/notices" && method === "GET")
    return json(
      checked(
        await db
          .from("announcements")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ),
    );
  if (
    segments[0] === "admin" &&
    segments[1] === "notices" &&
    segments[2] &&
    segments[3] === "versions" &&
    method === "GET"
  )
    return json(
      checked(
        await db
          .from("announcement_versions")
          .select("*")
          .eq("announcement_id", uuid.parse(segments[2]))
          .order("version", { ascending: false })
          .limit(100),
      ),
    );
  if (path === "admin/youtube" && method === "POST") {
    const input = z.object({ url: z.string().max(1000) }).parse(data);
    const metadata = parseYouTube(input.url);
    let title = "";
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(metadata.url)}&format=json`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (response.ok) title = (await response.json()).title || "";
    } catch {
      /* Playlist/manual titles are supported. */
    }
    return json({ ...metadata, title });
  }
  if (
    ["admin/videos", "admin/playlists"].includes(path) &&
    (method === "POST" || method === "PATCH")
  ) {
    const { cover_video_url, ...input } = archiveInput.parse(data);
    const playlist = path === "admin/playlists";
    let metadata: ReturnType<typeof archiveMetadata>;
    try {
      metadata = archiveMetadata(input.url, cover_video_url, playlist);
    } catch {
      throw new HttpError(
        400,
        "YouTube 동영상·재생목록 링크와 표지 링크를 확인해주세요.",
      );
    }
    const values = { ...input, ...metadata, visibility: "member" };
    if (playlist) delete (values as any).video_id;
    if (method === "PATCH")
      checked(
        await db
          .from(playlist ? "video_playlists" : "videos")
          .update(values)
          .eq("id", uuid.parse(data.id))
          .select("id")
          .single(),
      );
    else
      checked(
        await db
          .from(playlist ? "video_playlists" : "videos")
          .insert({ ...values, created_by: who.user!.id }),
      );
    return json({ ok: true });
  }
  if (path === "admin/rules" && method === "POST") {
    const input = z
      .object({
        category: cleanText(80).min(1),
        title: cleanText(200).min(1),
        content: cleanText(20000).min(1),
      })
      .parse(data);
    checked(
      await db.rpc("publish_rule", {
        p_category: input.category,
        p_title: input.title,
        p_content: input.content,
      }),
    );
    return json({ ok: true });
  }
  if (path === "admin/questions" && method === "GET")
    return json(
      checked(
        await db
          .from("form_questions")
          .select("*")
          .is("deleted_at", null)
          .order("sort_order"),
      ),
    );
  if (path === "admin/questions" && method === "POST") {
    const input = questionSchema.parse(data);
    checked(await db.from("form_questions").insert(input));
    return json({ ok: true });
  }
  if (
    segments.length === 3 &&
    segments[0] === "admin" &&
    segments[1] === "questions" &&
    ["PATCH", "DELETE"].includes(method)
  ) {
    const id = uuid.parse(segments[2]);
    const existing = checked(
      await db
        .from("form_questions")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single(),
    );
    if (method === "DELETE") {
      if (existing.is_system)
        throw new HttpError(
          400,
          "기본 신청 항목은 유지해야 합니다. 질문 문구와 도움말을 수정할 수 있습니다.",
        );
      checked(
        await db
          .from("form_questions")
          .update({ deleted_at: new Date().toISOString(), active: false })
          .eq("id", id)
          .select("id")
          .single(),
      );
    } else {
      const input = questionSchema.parse(data);
      if (input.key !== existing.key || input.form !== existing.form)
        throw new HttpError(
          400,
          "기존 답변 연결을 위해 질문 고유키와 신청서는 변경할 수 없습니다.",
        );
      const changes = existing.is_system
        ? {
            label: input.label,
            help_text: input.help_text,
            sort_order: input.sort_order,
          }
        : input;
      checked(
        await db
          .from("form_questions")
          .update(changes)
          .eq("id", id)
          .select("id")
          .single(),
      );
    }
    return json({ ok: true });
  }
  if (path === "admin/delete" && method === "POST") {
    const input = z
      .object({
        resource: z.enum([
          "events",
          "announcements",
          "videos",
          "video_playlists",
        ]),
        id: uuid,
      })
      .parse(data);
    if (input.resource === "events")
      checked(
        await db
          .from("events")
          .update({ status: "deleted", guests_open: false })
          .eq("id", input.id)
          .select("id")
          .single(),
      );
    else if (input.resource === "announcements")
      checked(
        await db
          .from("announcements")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", input.id)
          .is("deleted_at", null)
          .select("id")
          .single(),
      );
    else checked(await db.from(input.resource).delete().eq("id", input.id));
    return json({ ok: true });
  }
  if (path === "admin/export" && method === "GET") return exportData(db, url);
  if (path === "admin/import/template" && method === "GET") {
    const entity = z
      .enum(Object.keys(importColumns) as [ImportEntity, ...ImportEntity[]])
      .parse(url.searchParams.get("entity"));
    return new Response(csvSerialize([], importColumns[entity]), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity}-template.csv"`,
      },
    });
  }
  if (path === "admin/import/preview" && method === "POST") {
    const input = z
      .object({
        entity: z.string(),
        rows: z.array(z.unknown()).min(1).max(2000),
      })
      .parse(data);
    const result = validateImport(input.entity, input.rows);
    if (result.errors.length)
      return json(
        {
          errors: result.errors,
          summary: { new: 0, merge: 0, errors: result.errors.length },
        },
        422,
      );
    const digest = createHash("sha256")
      .update(JSON.stringify(result.data))
      .digest("hex");
    return json(
      checked(
        await db.rpc("preview_import", {
          p_entity: input.entity,
          p_rows: result.data,
          p_digest: digest,
        }),
      ),
    );
  }
  if (path === "admin/import/commit" && method === "POST") {
    const input = z
      .object({
        batch_id: uuid,
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        confirmed: z.literal(true),
      })
      .parse(data);
    return json(
      checked(
        await db.rpc("commit_import", {
          p_batch: input.batch_id,
          p_digest: input.digest,
        }),
      ),
    );
  }
  throw new HttpError(404, "요청을 찾을 수 없습니다.");
}
function bankInfo() {
  return {
    bank: process.env.CLUB_BANK_NAME || "카카오뱅크",
    account: process.env.CLUB_BANK_ACCOUNT || "3333349466142",
    holder: process.env.CLUB_BANK_HOLDER || "황태호",
  };
}
function attendanceRange(url: URL) {
  return {
    year: z.coerce
      .number()
      .int()
      .min(1900)
      .max(2200)
      .parse(url.searchParams.get("year") || seoulDate().slice(0, 4)),
    page: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(url.searchParams.get("page") || 0),
  };
}
async function validateExtra(
  db: Awaited<ReturnType<typeof serverClient>>,
  form: string,
  answers: Record<string, string>,
) {
  const questions = checked(
    await db
      .from("form_questions")
      .select("*")
      .eq("form", form)
      .eq("active", true),
  );
  for (const q of questions || []) {
    if (q.is_system || q.deleted_at) continue;
    const answer = answers[q.key];
    if (q.required && !answer?.trim())
      throw new HttpError(400, `${q.label} 항목을 입력해주세요.`);
    if (answer && q.type === "select" && !q.options.includes(answer))
      throw new HttpError(400, "선택 항목을 확인해주세요.");
  }
}
function applyFilters(q: any, url: URL, column: string) {
  for (const [key, operator] of [
    ["from", "gte"],
    ["to", "lte"],
  ] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      dateOnly.parse(value);
      q = q[operator](
        column,
        column === "submitted_at" || column.includes("starts_at")
          ? `${value}T${key === "from" ? "00:00:00" : "23:59:59"}+09:00`
          : value,
      );
    }
  }
  return q;
}
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await processRequest(request, (await context.params).path);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" / "),
        },
        400,
      );
    const code = (e as { code?: string }).code;
    const message = (e as Error).message || "";
    if (/name approval required/.test(message))
      return json(
        { error: "이름은 변경 요청을 제출한 뒤 관리자 승인을 받아야 합니다." },
        400,
      );
    if (/name changed|invalid name request/.test(message))
      return json(
        {
          error:
            "이름 변경 요청이 이미 처리되었거나 회원 정보가 변경되었습니다. 새로고침 후 확인해주세요.",
        },
        409,
      );
    if (/use avatar command/.test(message))
      return json({ error: "사진 등록·변경·삭제 버튼을 사용해주세요." }, 400);
    if (message === "SETUP_REQUIRED")
      return json(
        { error: "서비스 연결을 준비 중입니다. 잠시 후 다시 이용해주세요." },
        503,
      );
    if (code === "PGRST116")
      return json(
        { error: "요청한 일정을 찾을 수 없거나 이미 삭제되었습니다." },
        404,
      );
    if (/questions changed/.test(message))
      return json(
        {
          error:
            "신청 질문이 변경되었습니다. 새로고침 후 질문과 안내를 다시 확인해주세요.",
        },
        409,
      );
    if (/required question unanswered|invalid question answer/.test(message))
      return json(
        { error: "추가 질문의 필수 답변과 선택 항목을 확인해주세요." },
        400,
      );
    if (/notices changed/.test(message))
      return json(
        {
          error:
            "확인할 공지가 변경되었습니다. 새로고침 후 최신 안내를 확인해주세요.",
        },
        409,
      );
    if (code === "23505")
      return json(
        {
          error: "이미 등록된 신청 또는 연락처입니다. 운영진에게 확인해주세요.",
        },
        409,
      );
    if (/forbidden/.test(message))
      return json({ error: "접근 권한이 없습니다." }, 403);
    if (/rate limit/.test(message))
      return json(
        { error: "신청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        429,
      );
    if (/rules changed|rules not configured/.test(message))
      return json(
        {
          error: "회칙이 변경되었거나 준비 중입니다. 새로고침 후 확인해주세요.",
        },
        409,
      );
    if (
      /event unavailable|event has not ended|past paid event required|identity mismatch|expired preview|invalid batch/.test(
        message,
      )
    )
      return json(
        {
          error:
            "일정·회원 연결·미리보기 상태가 변경되었습니다. 다시 확인해주세요.",
        },
        409,
      );
    return json(
      {
        error:
          "처리하지 못했습니다. 입력 내용을 확인하거나 잠시 후 다시 시도해주세요.",
      },
      503,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };

async function signAvatars<T extends { avatar_path?: string | null }>(
  db: Awaited<ReturnType<typeof serverClient>>,
  rows: T[],
) {
  const paths = rows.flatMap((r) => (r.avatar_path ? [r.avatar_path] : []));
  if (!paths.length) return rows;
  const { data, error } = await db.storage
    .from("avatars")
    .createSignedUrls(paths, 300);
  if (error) throw error;
  const urls = new Map((data || []).map((r) => [r.path, r.signedUrl]));
  return rows.map((r) => ({
    ...r,
    avatar_url: r.avatar_path ? urls.get(r.avatar_path) || null : null,
  }));
}

function visibleNotices(db: Awaited<ReturnType<typeof serverClient>>) {
  const now = new Date().toISOString();
  return db
    .from("announcements")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("priority")
    .order("created_at", { ascending: false });
}
