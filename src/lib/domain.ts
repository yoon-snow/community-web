import { z } from "zod";
export const positions = [
  "레프트",
  "라이트",
  "센터",
  "세터",
  "리베로",
  "수비",
  "미정",
];
export const eventKinds: Record<string, string> = {
  practice: "일반 운동",
  lesson: "레슨데이",
  game: "게임데이",
  match: "교류전",
  tournament: "대회",
  social: "회식",
  other: "기타",
  event: "이벤트",
  holiday: "휴무",
};
export const videoCategories: Record<string, string> = {
  game: "Game Day",
  lesson: "Lesson",
  match: "대회",
  practice: "연습",
  event: "이벤트",
};
export function normalizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.replace(/^\+?82(?:0)?/, "0");
}
const seoulDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function seoulDate(value: string | Date = new Date()) {
  return seoulDayFormat.format(new Date(value));
}
export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    weekday: "short",
  },
) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...options,
  }).format(new Date(value));
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export const uuid = z.string().uuid();
export const cleanText = (max = 500) => z.string().trim().max(max);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "올바른 날짜를 입력해주세요.",
  );
export const phone = z
  .string()
  .transform(normalizePhone)
  .pipe(
    z.string().regex(/^01[016789]\d{7,8}$/, "휴대전화번호를 확인해주세요."),
  );
export const applicationSchema = z.object({
  name: cleanText(80).min(1),
  birth_date: dateOnly.refine(
    (v) => v <= seoulDate(),
    "생년월일을 확인해주세요.",
  ),
  gender: z.enum(["여성", "남성", "기타", "응답하지 않음"]),
  phone,
  position: cleanText(80).min(1),
  experience: cleanText(200).min(1),
  source: cleanText(200),
  notes: cleanText(2000).default(""),
  privacy_consent: z.literal(true),
  photo_consent: z.literal(true),
  rules_consent: z.literal(true),
  self_reported_paid: z.boolean(),
  fee_acknowledgement: z.literal(true),
  current_month_guest: cleanText(500).default(""),
  rule_versions: z.record(z.string(), z.number().int().positive()),
  extra_answers: z.record(z.string(), z.string().max(2000)).default({}),
});
export const guestSchema = applicationSchema.extend({
  event_id: uuid,
  notice_consent: z.literal(true),
  question_versions: z.record(uuid, z.number().int().positive()),
  announcement_versions: z
    .record(uuid, z.number().int().positive())
    .default({}),
});
export const membershipSchema = applicationSchema
  .extend({
    current_month_guest_participated: z.boolean(),
  })
  .refine(
    (v) =>
      !v.current_month_guest_participated ||
      v.current_month_guest.trim().length > 0,
    "당월 게스트 참여 날짜와 입금 내역을 입력해주세요.",
  );
export const questionSchema = z
  .object({
    form: z.enum(["guest", "member"]),
    key: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),
    label: cleanText(500).min(1),
    help_text: cleanText(2000).default(""),
    type: z.enum(["text", "textarea", "select"]),
    options: z.array(cleanText(200).min(1)).max(30),
    required: z.boolean(),
    active: z.boolean(),
    sort_order: z.number().int().min(0).max(100),
  })
  .refine(
    (q) =>
      q.type !== "select" ||
      (q.options.length > 0 && new Set(q.options).size === q.options.length),
    "선택지는 중복 없이 하나 이상 입력해주세요.",
  );
export const eventSchema = z
  .object({
    title: cleanText(150).min(1),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    location: cleanText(200).min(1),
    kind: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    description: cleanText(5000).default(""),
    guests_open: z.boolean(),
    is_emergency: z.boolean().default(false),
    change_reason: cleanText(2000).default(""),
    guest_fee: z.number().int().min(0).max(1000000),
    status: z.enum(["scheduled", "cancelled", "completed", "deleted"]),
  })
  .refine(
    (e) => !e.is_emergency || e.change_reason.trim().length > 0,
    "긴급 변경 안내를 입력해주세요.",
  )
  .refine(
    (e) => Date.parse(e.ends_at) > Date.parse(e.starts_at),
    "종료시간은 시작시간 이후여야 합니다.",
  );
export const noticeSchema = z
  .object({
    title: cleanText(200).min(1),
    content: cleanText(20000).min(1),
    kind: z.enum(["general", "required", "event", "emergency"]),
    audience: z.enum(["public", "member", "admin"]),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }).nullable(),
  })
  .refine(
    (n) => !n.ends_at || Date.parse(n.ends_at) > Date.parse(n.starts_at),
    "게시 종료일을 확인해주세요.",
  );
export function parseYouTube(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("YouTube URL을 확인해주세요.");
  }
  const host = url.hostname.replace(/^www\./, "");
  if (
    url.protocol !== "https:" ||
    !["youtube.com", "m.youtube.com", "youtu.be"].includes(host)
  )
    throw new Error("https YouTube 링크만 사용할 수 있습니다.");
  const videoId =
    host === "youtu.be"
      ? url.pathname.slice(1).split("/")[0]
      : url.searchParams.get("v") ||
        url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ||
        null;
  const playlistId = url.searchParams.get("list");
  if (
    (videoId && !/^[\w-]{11}$/.test(videoId)) ||
    (playlistId && !/^[\w-]{10,100}$/.test(playlistId)) ||
    (!videoId && !playlistId)
  )
    throw new Error("동영상 또는 재생목록 링크를 확인해주세요.");
  return {
    video_id: videoId,
    playlist_id: playlistId,
    thumbnail: videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : null,
    url: url.toString(),
  };
}
export const archiveInput = z.object({
  title: cleanText(200).min(1),
  description: cleanText(5000).default(""),
  url: cleanText(1000).min(1),
  filmed_on: dateOnly,
  kind: z.enum(["game", "lesson", "match", "practice", "event"]),
  event_id: uuid.nullable(),
  visibility: z.enum(["public", "member"]).default("member"),
  video_count: z.number().int().min(0).max(100000).nullable().default(null),
  cover_video_url: cleanText(1000).default(""),
});
export function archiveMetadata(url: string, coverUrl = "", playlist = false) {
  const metadata = parseYouTube(url);
  if (playlist && !metadata.playlist_id)
    throw new Error("재생목록 링크를 확인해주세요.");
  const cover = coverUrl ? parseYouTube(coverUrl) : null;
  if (cover && !cover.video_id)
    throw new Error("표지에는 동영상 링크를 입력해주세요.");
  const coverId =
    playlist || !metadata.video_id
      ? cover?.video_id || metadata.video_id
      : null;
  return {
    ...metadata,
    ...(playlist
      ? {
          video_id: null,
          url: `https://www.youtube.com/playlist?list=${metadata.playlist_id}`,
        }
      : {}),
    cover_video_id: coverId,
    thumbnail:
      metadata.video_id && !playlist
        ? metadata.thumbnail
        : coverId
          ? `https://i.ytimg.com/vi/${coverId}/hqdefault.jpg`
          : null,
  };
}
export function safeSpreadsheetCell(value: unknown) {
  const text = String(value ?? "");
  return /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
export function csvSerialize(
  rows: Record<string, unknown>[],
  headers?: string[],
) {
  const keys = headers || Object.keys(rows[0] || {});
  const quote = (v: unknown) =>
    '"' + safeSpreadsheetCell(v).replace(/"/g, '""') + '"';
  return (
    "\uFEFF" +
    [keys, ...rows.map((r) => keys.map((k) => r[k]))]
      .map((r) => r.map(quote).join(","))
      .join("\r\n")
  );
}
export function rosterText(
  event: { title: string; starts_at: string },
  members: { name: string; position: string }[],
  guests: { name: string; position: string }[],
) {
  return `[SpotLight ${formatDate(event.starts_at, { month: "numeric", day: "numeric" })} 참가 명단]\n${event.title}\n\n회원 ${members.length}명\n게스트 ${guests.length}명\n총 ${members.length + guests.length}명\n\n[회원]\n${members.map((m, i) => `${i + 1}. ${m.name} / ${m.position}`).join("\n")}\n\n[게스트]\n${guests.map((g, i) => `${i + 1}. ${g.name} / ${g.position}`).join("\n")}`;
}
export type ClubEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  kind: string;
  description: string;
  guests_open: boolean;
  guest_fee: number;
  status: string;
  is_emergency?: boolean;
  change_reason?: string;
};
export type ClubRow = Record<string, any>; // Runtime boundary is validated by Zod; DB rows use resource-specific projections.

export function monthBounds(month: string) {
  z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(month);
  const [year, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, m - 1, 1) - 9 * 3600000).toISOString(),
    end: new Date(Date.UTC(year, m, 1) - 9 * 3600000).toISOString(),
  };
}

export function sortAnnouncements<
  T extends { kind?: string; created_at?: string },
>(rows: T[]): T[] {
  const rank: Record<string, number> = {
    emergency: 0,
    required: 1,
    event: 2,
    general: 3,
  };
  return [...rows].sort(
    (a, b) =>
      (rank[a.kind || ""] ?? 4) - (rank[b.kind || ""] ?? 4) ||
      (b.created_at || "").localeCompare(a.created_at || ""),
  );
}
export function noticeVersions(
  rows: { id: string; version?: number }[],
): Record<string, number> {
  return Object.fromEntries(rows.map((n) => [n.id, n.version || 1]));
}
export function canApplyAsGuest(event: ClubEvent, now = new Date()): boolean {
  return (
    event.guests_open &&
    event.status === "scheduled" &&
    event.kind !== "holiday" &&
    new Date(event.starts_at) > now
  );
}
export function guestAvailability(event: ClubEvent): string {
  return event.status === "cancelled"
    ? "운동 취소"
    : event.kind === "holiday"
      ? "휴무"
      : event.status === "completed" || new Date(event.starts_at) <= new Date()
        ? "신청 마감"
        : event.guests_open
          ? "게스트 신청 가능"
          : "게스트 신청 불가";
}
