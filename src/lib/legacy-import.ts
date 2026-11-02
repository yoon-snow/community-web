import { normalizePhone, seoulDate } from "./domain";
import type { ImportEntity } from "./import";
export type LegacyMapping = {
  members?: Record<string, string>;
  guests?: Record<string, string>;
  events?: Record<string, string>;
  attendanceMarks?: Record<string, boolean>;
  paymentMarks?: Record<string, "paid" | "unpaid" | "exempt">;
  dateCorrections?: Record<string, string>;
  eventFees?: Record<string, number>;
  timestampOffset?: string;
  year?: number;
};
type Issue = { row: number; message: string };
export function legacyDate(
  input: unknown,
  corrections: Record<string, string> = {},
) {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  const text = String(input ?? "").trim();
  if (corrections[text]) return legacyDate(corrections[text]);
  let date = text.match(
    /^(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})(?:일|\s|T|$)/,
  );
  if (!date) {
    const compact = text.match(
      /^(\d{2})(\d{2})(\d{2})(?:\([월화수목금토일]\))?$/,
    );
    if (compact) date = ["", `20${compact[1]}`, compact[2], compact[3]];
  }
  if (!date) throw new Error(`날짜 확인 필요: ${text || "(비어 있음)"}`);
  const value = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
  if (
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error(`유효하지 않은 날짜: ${text}`);
  const weekday = text.match(/\(([월화수목금토일])\)/)?.[1];
  if (
    weekday &&
    "일월화수목금토"[new Date(value + "T12:00:00+09:00").getDay()] !== weekday
  )
    throw new Error(`요일과 날짜 불일치: ${text}`);
  return value;
}
export function legacyTimestamp(input: unknown, offset?: string) {
  if (input instanceof Date) {
    if (!offset || !/^[-+]\d{2}:\d{2}$/.test(offset))
      throw new Error(
        "Excel 신청시각의 타임존을 timestampOffset으로 확인해주세요.",
      );
    return new Date(input.toISOString().slice(0, 19) + offset).toISOString();
  }
  const text = String(input ?? "").trim();
  if (
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) &&
    Number.isFinite(Date.parse(text))
  )
    return new Date(text).toISOString();
  const match = text.match(
    /^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})[.]?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match || !offset || !/^[-+]\d{2}:\d{2}$/.test(offset))
    throw new Error(`신청시각·타임존 확인 필요: ${text}`);
  let hour = Number(match[5]);
  if (match[4]) {
    hour %= 12;
    if (match[4] === "오후") hour += 12;
  }
  if (hour > 23 || Number(match[6]) > 59 || Number(match[7] || 0) > 59)
    throw new Error("신청시각을 확인해주세요.");
  const date = legacyDate(`${match[1]}-${match[2]}-${match[3]}`);
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${match[6]}:${match[7] || "00"}${offset}`,
  ).toISOString();
}
export function convertLegacy(
  sheet: string,
  rows: unknown[][],
  target: ImportEntity,
  mapping: LegacyMapping = {},
) {
  const result: Record<string, unknown>[] = [];
  const issues: Issue[] = [];
  const nameId = (name: unknown) => {
    const n = String(name ?? "").trim();
    const id = mapping.members?.[n];
    if (!id)
      throw new Error(
        `이름만으로 회원 연결 불가: ${n}. 검토한 members 매핑 ID가 필요합니다.`,
      );
    return id;
  };
  const each = (start: number, callback: (r: unknown[], i: number) => void) =>
    rows.slice(start).forEach((r, i) => {
      if (!r.some((v) => String(v ?? "").trim())) return;
      try {
        callback(r, i + start + 1);
      } catch (e) {
        issues.push({ row: i + start + 1, message: (e as Error).message });
      }
    });
  if (sheet === "회원명단" && target === "members")
    each(3, (r, i) => {
      for (const base of [1, 8]) {
        if (!String(r[base + 1] ?? "").trim()) continue;
        try {
          const phone = normalizePhone(String(r[base + 3] ?? ""));
          result.push({
            external_id: `spotlight:member:${phone}`,
            name: String(r[base + 1]).trim(),
            phone,
            birth_date: legacyDate(r[base + 2], mapping.dateCorrections),
            joined_on: legacyDate(r[base + 4], mapping.dateCorrections),
            position: "",
            experience: "",
            status: "active",
            admin_memo: [r[base + 5], r[base + 6]].filter(Boolean).join("\n"),
          });
        } catch (e) {
          issues.push({ row: i, message: (e as Error).message });
        }
      }
    });
  else if (sheet === "게스트 신청서" && target === "guests") {
    const phones = new Map<string, Record<string, unknown>>();
    each(1, (r) => {
      const phone = normalizePhone(String(r[8] ?? ""));
      if (!/^01[016789]\d{7,8}$/.test(phone))
        throw new Error("휴대전화번호를 확인해주세요.");
      if (!phones.has(phone))
        phones.set(phone, {
          external_id: `spotlight:guest:${phone}`,
          name: String(r[1] ?? "").trim(),
          phone,
          position: String(r[5] ?? ""),
        });
    });
    result.push(...phones.values());
  } else if (sheet === "게스트 신청서" && target === "guest_applications")
    each(1, (r, i) => {
      const phone = normalizePhone(String(r[8] ?? "")),
        date = legacyDate(r[4], mapping.dateCorrections);
      const guest = mapping.guests?.[phone],
        event = mapping.events?.[date];
      if (!Number.isFinite(mapping.eventFees?.[date]))
        throw new Error(`${date}: eventFees에 확인한 참가비가 필요합니다.`);
      if (!guest || !event)
        throw new Error(
          `${date}: 검토한 guest_id(전화번호)와 event_id(날짜) 매핑이 필요합니다.`,
        );
      result.push({
        external_id: `spotlight:ga:${phone}:${legacyTimestamp(r[0], mapping.timestampOffset)}:${event}`,
        guest_id: guest,
        event_id: event,
        submitted_at: legacyTimestamp(r[0], mapping.timestampOffset),
        answers: {
          source_record: Object.fromEntries(
            (rows[0] || []).map((h, c) => [String(h), r[c] ?? null]),
          ),
          birth_date: legacyDate(r[2], mapping.dateCorrections),
          gender: r[3],
          position: r[5],
          experience: r[6],
          photo_consent_original: r[9],
          privacy_consent_original: r[10],
          source: r[11],
          payment_answer_original: r[12],
          notes: r[13],
          admin_memo: r[15],
        },
        self_reported_paid: /^(네|예|입금했습니다|true)$/.test(
          String(r[12]).trim(),
        ),
        payment_status: "pending",
        amount: mapping.eventFees![date],
      });
    });
  else if (sheet === "회원 가입서" && target === "member_applications")
    each(1, (r, i) => {
      result.push({
        external_id: `spotlight:member-application:${r[0] || i}`,
        name: r[2],
        phone: normalizePhone(String(r[5] || r[14] || "")),
        submitted_at: legacyTimestamp(r[1], mapping.timestampOffset),
        answers: {
          source_record: Object.fromEntries(
            (rows[0] || []).map((h, c) => [String(h), r[c] ?? null]),
          ),
          birth_date: legacyDate(r[3], mapping.dateCorrections),
          gender: r[4],
          position: r[6],
          experience: r[7],
          photo_consent_original: r[8],
          privacy_consent_original: r[9],
          source: r[10],
          notes: r[11],
          payment_answer_original: r[12],
          current_month_guest: r[13],
          admin_memo: r[16],
        },
      });
    });
  else if (sheet.startsWith("회비납부명단") && target === "membership_payments")
    each(4, (r, i) => {
      if (!String(r[3] ?? "").trim()) return;
      const member = nameId(r[3]);
      const year = mapping.year || Number(sheet.match(/\((\d{4})년\)/)?.[1]);
      if (!year) throw new Error("회비 연도가 필요합니다.");
      for (let month = 1; month <= 12; month++) {
        const cell = String(r[month + 3] ?? "").trim();
        if (!cell) continue;
        const status = mapping.paymentMarks?.[cell];
        if (!status) {
          issues.push({
            row: i,
            message: `${month}월 '${cell}': 입금 상태 매핑이 필요합니다.`,
          });
          continue;
        }
        const amount = Number(cell.replace(/[,원\s]/g, ""));
        if (!Number.isFinite(amount)) {
          issues.push({
            row: i,
            message: `${month}월 '${cell}': 금액이 불명확합니다. 금액을 확인해주세요.`,
          });
          continue;
        }
        result.push({
          external_id: `spotlight:dues:${member}:${year}-${month}`,
          member_id: member,
          month: `${year}-${String(month).padStart(2, "0")}-01`,
          amount,
          status,
        });
      }
    });
  else if (sheet === "출석원본" && target === "event_attendance")
    each(1, (r, i) => {
      const name = String(r[0] ?? "").trim();
      if (!name) return;
      const member = nameId(name);
      for (let c = 1; c < r.length; c++) {
        const text = String(r[c] ?? "").trim();
        if (!text) continue;
        const actual = mapping.attendanceMarks?.[text];
        if (typeof actual !== "boolean") {
          issues.push({
            row: i,
            message: `출석 기호 '${text}'의 의미를 매핑해주세요.`,
          });
          continue;
        }
        try {
          const date = legacyDate(rows[0][c], mapping.dateCorrections),
            event = mapping.events?.[date];
          if (!event) throw new Error(`${date}: 검토한 event_id가 필요합니다.`);
          result.push({
            member_id: member,
            event_id: event,
            response: "unanswered",
            actual,
          });
        } catch (e) {
          issues.push({ row: i, message: (e as Error).message });
        }
      }
    });
  else if (sheet === "유니폼" && target === "uniforms")
    each(1, (r) => {
      if (!String(r[0] ?? "").trim()) return;
      result.push({
        member_id: nameId(r[0]),
        nickname: String(r[1] ?? ""),
        number: String(r[2] ?? ""),
        top_size: String(r[3] ?? ""),
        bottom_size: String(r[4] ?? ""),
      });
    });
  else if (sheet === "스포트라이트 회칙" && target === "rules") {
    let category = "";
    let lines: string[] = [];
    const flush = () => {
      if (category && lines.length)
        result.push({
          category,
          title: category,
          content: [String(rows[0]?.[0] || ""), ...lines]
            .filter(Boolean)
            .join("\n\n"),
        });
    };
    for (const r of rows.slice(2)) {
      const label = String(r[1] ?? "").trim();
      if (label) {
        flush();
        category = label;
        lines = [];
      }
      const content = r
        .slice(2)
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      if (content) lines.push(content);
    }
    flush();
  } else
    throw new Error(
      "이 원본 시트와 대상의 조합은 자동 변환하지 않습니다. 양식 CSV와 열 매핑을 사용해주세요.",
    );
  return { rows: result, issues };
}
