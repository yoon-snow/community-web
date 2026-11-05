import { z } from "zod";
import { dateOnly, phone, uuid, cleanText, eventSchema } from "./domain";
const external_id = cleanText(150).min(1);
// Normalize explicit year/month/day dates only; never guess serials or US/EU dates.
const importDate = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  const parts =
    text.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/) ||
    text.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  return parts
    ? `${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`
    : text;
}, dateOnly);
export const importSchemas = {
  members: z.object({
    external_id,
    name: cleanText(80).min(1),
    phone,
    birth_date: importDate.nullable().optional(),
    position: cleanText(80).default(""),
    experience: cleanText(200).default(""),
    joined_on: importDate,
    admin_memo: cleanText(5000).default(""),
    status: z.enum(["active", "inactive", "withdrawn"]),
  }),
  guests: z.object({
    external_id,
    name: cleanText(80).min(1),
    phone,
    position: cleanText(80).default(""),
  }),
  events: eventSchema.and(z.object({ external_id })),
  guest_applications: z.object({
    external_id,
    guest_id: uuid,
    event_id: uuid,
    answers: z.record(z.string(), z.unknown()),
    self_reported_paid: z.boolean(),
    submitted_at: z.string().datetime({ offset: true }),
    payment_status: z.enum(["pending", "paid"]),
    amount: z.number().int().nonnegative(),
  }),
  member_applications: z.object({
    external_id,
    name: cleanText(80).min(1),
    phone,
    answers: z.record(z.string(), z.unknown()),
    submitted_at: z.string().datetime({ offset: true }),
  }),
  membership_payments: z.object({
    external_id,
    member_id: uuid,
    month: importDate.refine((v) => v.endsWith("-01")),
    amount: z.number().int().nonnegative(),
    status: z.enum(["paid", "unpaid", "exempt"]),
  }),
  event_attendance: z.object({
    member_id: uuid,
    event_id: uuid,
    response: z.enum(["yes", "no", "unanswered"]),
    actual: z.boolean().nullable(),
  }),
  uniforms: z.object({
    member_id: uuid,
    nickname: cleanText(80),
    number: cleanText(20),
    top_size: cleanText(40),
    bottom_size: cleanText(40),
  }),
  rules: z.object({
    category: cleanText(80).min(1),
    title: cleanText(200).min(1),
    content: cleanText(20000).min(1),
  }),
};
export type ImportEntity = keyof typeof importSchemas;
export function validateImport(entity: string, rows: unknown[]) {
  if (!(entity in importSchemas))
    throw new Error("지원하지 않는 데이터 종류입니다.");
  const schema = importSchemas[entity as ImportEntity];
  const errors: { row: number; message: string }[] = [];
  const data: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const identities = new Set<string>();
  rows.forEach((row, i) => {
    const result = schema.safeParse(row);
    if (!result.success) {
      errors.push({
        row: i + 2,
        message: result.error.issues
          .map((v) => `${v.path.join(".")}: ${v.message}`)
          .join(" / "),
      });
      return;
    }
    const d = result.data as Record<string, unknown>;
    const key = String(
      d.external_id ||
        [d.member_id, d.event_id || d.month || "uniform"].join(":"),
    );
    if (seen.has(key)) {
      errors.push({
        row: i + 2,
        message: "같은 파일에 중복 식별자가 있습니다.",
      });
      return;
    }
    const identity =
      entity === "members" || entity === "guests"
        ? String(d.phone)
        : entity === "guest_applications"
          ? `${d.guest_id}:${d.event_id}`
          : entity === "membership_payments"
            ? `${d.member_id}:${d.month}`
            : entity === "rules"
              ? String(d.category)
              : null;
    if (identity && identities.has(identity)) {
      errors.push({
        row: i + 2,
        message:
          "같은 파일에 중복 사용자 또는 동일 기간·일정 기록이 있습니다. 원본을 확인해주세요.",
      });
      return;
    }
    seen.add(key);
    if (identity) identities.add(identity);
    data.push(d);
  });
  return { data, errors };
}
// Used after a mapping is explicitly selected. Never coerce unknown payment/consent labels.
export function coerceImportCell(value: unknown) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (typeof value === "string" && value.startsWith("{")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
export const importColumns: Record<ImportEntity, string[]> = {
  members: [
    "external_id",
    "name",
    "phone",
    "birth_date",
    "position",
    "experience",
    "joined_on",
    "status",
    "admin_memo",
  ],
  guests: ["external_id", "name", "phone", "position"],
  events: [
    "external_id",
    "title",
    "starts_at",
    "ends_at",
    "location",
    "kind",
    "description",
    "guests_open",
    "guest_fee",
    "status",
  ],
  guest_applications: [
    "external_id",
    "guest_id",
    "event_id",
    "answers",
    "self_reported_paid",
    "submitted_at",
    "payment_status",
    "amount",
  ],
  member_applications: [
    "external_id",
    "name",
    "phone",
    "answers",
    "submitted_at",
  ],
  membership_payments: [
    "external_id",
    "member_id",
    "month",
    "amount",
    "status",
  ],
  event_attendance: ["member_id", "event_id", "response", "actual"],
  uniforms: ["member_id", "nickname", "number", "top_size", "bottom_size"],
  rules: ["category", "title", "content"],
};
