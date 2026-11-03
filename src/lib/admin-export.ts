import { z } from "zod";
import { serverClient, HttpError, identity } from "@/lib/supabase/server";
import {
  csvSerialize,
  safeSpreadsheetCell,
  uuid,
  dateOnly,
  monthBounds,
} from "@/lib/domain";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
function checked<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
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
export async function collectAdminExport(
  db: Awaited<ReturnType<typeof serverClient>>,
  url: URL,
) {
  const who = await identity(db);
  if (!who.user || !who.admin)
    throw new HttpError(403, "운영진만 이용할 수 있습니다.");
  const resource = z
    .enum(["guests", "members", "attendance", "dues", "events"])
    .parse(url.searchParams.get("resource"));
  const format = z.enum(["csv", "xlsx"]).parse(url.searchParams.get("format"));
  const table = {
    guests: "guest_applications",
    members: "members",
    attendance: "event_attendance",
    dues: "membership_payments",
    events: "events",
  }[resource];
  const selection = {
    guests:
      "*,guests(name,phone,position),guest_payments!inner(status,amount),events(title,starts_at)",
    members: "*",
    attendance: "*,members(name),events!inner(title,starts_at)",
    dues: "*,members(name)",
    events: "*",
  }[resource];
  const monthFilter = url.searchParams.get("month");
  if (monthFilter) {
    const bounds = monthBounds(
      z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .parse(monthFilter),
    );
    if (resource !== "dues") {
      if (!url.searchParams.get("from"))
        url.searchParams.set("from", monthFilter + "-01");
      if (!url.searchParams.get("to"))
        url.searchParams.set(
          "to",
          new Date(new Date(bounds.end).getTime() - 1).toLocaleDateString(
            "sv-SE",
            { timeZone: "Asia/Seoul" },
          ),
        );
    }
  }
  const rows: Record<string, unknown>[] = [];
  // Paginate through all filtered rows; never silently export only the first API page.
  for (let offset = 0; offset < 50000; offset += 500) {
    let q = db
      .from(table)
      .select(selection)
      .order(
        resource === "guests"
          ? "submitted_at"
          : resource === "dues"
            ? "month"
            : "id",
      );
    const column =
      resource === "guests"
        ? "submitted_at"
        : resource === "events"
          ? "starts_at"
          : resource === "dues"
            ? "month"
            : resource === "members"
              ? "joined_on"
              : resource === "attendance"
                ? "events.starts_at"
                : null;
    if (column) q = applyFilters(q, url, column);
    const search = url.searchParams.get("q");
    if (resource === "members" && search)
      q = q.ilike("name", `%${search.replace(/[%_]/g, "").slice(0, 80)}%`);
    const status = url.searchParams.get("status");
    if (
      status &&
      status !== "all" &&
      ["guests", "members", "dues"].includes(resource)
    )
      q = q.eq(
        resource === "guests" ? "guest_payments.status" : "status",
        status,
      );
    const event = url.searchParams.get("event");
    if (event && ["guests", "attendance"].includes(resource))
      q = q.eq("event_id", uuid.parse(event));
    const response = url.searchParams.get("response");
    if (resource === "attendance" && response && response !== "all")
      q = q.eq("response", z.enum(["yes", "no", "unanswered"]).parse(response));
    const member = url.searchParams.get("member");
    if (member && ["attendance", "dues"].includes(resource))
      q = q.eq("member_id", uuid.parse(member));
    const month = url.searchParams.get("month");
    if (month && resource === "dues")
      q = q.eq(
        "month",
        `${z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .parse(month)}-01`,
      );
    const actual = url.searchParams.get("actual");
    if (resource === "attendance" && actual && actual !== "all") {
      z.enum(["true", "false", "unchecked"]).parse(actual);
      q =
        actual === "unchecked"
          ? q.is("actual", null)
          : q.eq("actual", actual === "true");
    }
    if (resource === "guests" || resource === "dues") q = q.order("id");
    const result = checked(
      await q.range(offset, offset + 499),
    ) as unknown as Record<string, unknown>[];
    for (const r of result) {
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const [sub, val] of Object.entries(v))
            flat[`${k}.${sub}`] =
              typeof val === "object" ? JSON.stringify(val) : val;
        } else flat[k] = v;
      }
      rows.push(flat);
    }
    if (result.length < 500) break;
    if (offset === 49500)
      throw new HttpError(413, "기간을 나눠 50,000행 이하로 내보내주세요.");
  }
  return { resource, format, rows };
}

// A future Google Sheets adapter can consume these same filtered rows.
export async function exportData(
  db: Awaited<ReturnType<typeof serverClient>>,
  url: URL,
) {
  const { resource, format, rows } = await collectAdminExport(db, url);
  const columns = Array.from(new Set(rows.flatMap(Object.keys)));
  if (format === "csv")
    return new Response(csvSerialize(rows, columns), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="spotlight-${resource}.csv"`,
      },
    });
  const writeExcel = (await import("write-excel-file/node")).default;
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  if (!keys.length) keys.push("result");
  const cells = [
    keys.map((value) => ({ value, fontWeight: "bold" as const })),
    ...rows.map((r) =>
      keys.map((k) => ({
        value:
          typeof r[k] === "number" || typeof r[k] === "boolean"
            ? (r[k] as number | boolean)
            : safeSpreadsheetCell(r[k]),
      })),
    ),
  ];
  const bytes = await writeExcel(cells, {
    sheet: "SpotLight",
    columns: keys.map(() => ({ width: 22 })),
  }).toBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...headers,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="spotlight-${resource}.xlsx"`,
    },
  });
}
