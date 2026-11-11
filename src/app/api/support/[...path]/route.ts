import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import {
  serverClient,
  serviceClient,
  identity,
  HttpError,
} from "@/lib/supabase/server";
import { validReceipt } from "@/lib/support-receipt";
import { normalizePhone, seoulDate } from "@/lib/domain";
import { deliverPush } from "@/lib/push";

type Ctx = { params: Promise<{ path: string[] }> };
type DB = ReturnType<typeof serviceClient>;
const bucket = "inquiry-images";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const summary =
  "id,title,status,category_id,member_id,name,created_at,updated_at,last_reply_at";
const uuid = z.string().uuid();
const short = (max: number) => z.string().trim().min(1).max(max);
const faqSchema = z.object({
  id: uuid.optional(),
  category_id: short(40),
  question: short(180),
  answer: short(4000),
  keywords: z.array(short(60)).max(30),
  sort_order: z.number().int().min(0).max(99999),
  is_featured: z.boolean(),
  is_active: z.boolean(),
});
function data<T>(result: { data: T; error: any }) {
  if (result.error)
    throw new HttpError(
      result.error.message?.includes("support_image_limit") ? 400 : 503,
      result.error.message?.includes("support_image_limit")
        ? "문의당 사진은 최대 3장입니다."
        : "문의 정보를 처리할 수 없습니다. 잠시 후 다시 시도해주세요.",
    );
  return result.data;
}
function denied(): never {
  throw new HttpError(
    404,
    "문의를 열 수 없습니다. 문의 링크나 로그인 계정을 확인해주세요.",
  );
}
async function throttle(db: DB, req: Request, kind: string, limit: number) {
  const ip = process.env.VERCEL
    ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]
    : req.headers.get("x-real-ip");
  if (
    !data(
      await db.rpc("support_allow", {
        p_key: hash(
          kind +
            ":" +
            process.env.SUPABASE_SERVICE_ROLE_KEY +
            ":" +
            (ip || "local"),
        ),
        p_limit: limit,
      }),
    )
  )
    throw new HttpError(429, "요청이 많습니다. 잠시 후 다시 시도해주세요.");
}
async function imageUploads(
  db: DB,
  id: string,
  files: FormDataEntryValue[],
  paths: string[],
) {
  if (files.length > 3) throw new HttpError(400, "사진은 최대 3장입니다.");
  for (const file of files) {
    if (typeof file === "string" || !file.size || file.size > 1048576)
      throw new HttpError(400, "사진 한 장은 최대 1MB입니다.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = bytes
      .subarray(0, 8)
      .equals(Buffer.from("89504e470d0a1a0a", "hex"))
      ? "png"
      : bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
        ? "jpeg"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!type) throw new HttpError(400, "JPG, PNG, WebP 사진을 선택해주세요.");
    const path = id + "/" + randomUUID() + "." + type;
    data(
      await db.storage
        .from(bucket)
        .upload(path, bytes, { contentType: "image/" + type }),
    );
    paths.push(path);
  }
}
async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const route = path.join("/"),
    url = new URL(req.url),
    write = req.method === "POST";
  if (write && req.headers.get("origin") !== url.origin)
    throw new HttpError(403, "요청 출처를 확인해주세요.");
  if (write && Number(req.headers.get("content-length") || 0) > 3500000)
    throw new HttpError(413, "사진 용량을 줄여주세요.");
  const client = await serverClient();
  if (route === "catalog" && !write) {
    const [cats, faqs] = await Promise.all([
      client.from("faq_categories").select("*").order("sort_order"),
      client
        .from("faqs")
        .select(
          "id,category_id,question,answer,keywords,sort_order,is_featured,is_active,view_count",
        )
        .order("sort_order"),
    ]);
    return { categories: data(cats), faqs: data(faqs) };
  }
  const db = serviceClient();
  if (route === "view" && write) {
    const { id } = z.object({ id: uuid }).parse(await req.json());
    await throttle(db, req, "faq", 240);
    data(await db.rpc("support_view", { p_id: id }));
    return { ok: true };
  }
  const who = await identity(client);
  const admin = path[0] === "admin";
  if (admin && !who.admin)
    throw new HttpError(403, "운영진 권한이 필요합니다.");
  if (route === "admin/faqs") {
    if (!write)
      return {
        categories: data(
          await db.from("faq_categories").select("*").order("sort_order"),
        ),
        faqs: data(await db.from("faqs").select("*").order("sort_order")),
      };
    const faq = faqSchema.parse(await req.json());
    data(
      await db.from("faqs").upsert({
        ...faq,
        updated_by: who.user!.id,
        updated_at: new Date().toISOString(),
      }),
    );
    return { ok: true };
  }
  if ((route === "mine" || route === "admin/inbox") && !write) {
    if (!who.member) throw new HttpError(401, "회원 로그인 후 확인해주세요.");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(url.searchParams.get("page") || 0);
    let q = db
      .from("inquiries")
      .select(summary, { count: "exact" })
      .order("updated_at", { ascending: false })
      .order("id");
    if (!admin) q = q.eq("member_id", who.member.id);
    const status = url.searchParams.get("status"),
      role = url.searchParams.get("role"),
      cat = url.searchParams.get("category");
    if (status) q = q.eq("status", status);
    if (role === "guest") q = q.is("member_id", null);
    if (role === "member") q = q.not("member_id", "is", null);
    if (cat) q = q.eq("category_id", cat);
    const rows = await q.range(page * 30, page * 30 + 29);
    const countTickets = () => {
      let query = db
        .from("inquiries")
        .select("id", { count: "exact", head: true });
      if (role === "guest") query = query.is("member_id", null);
      if (role === "member") query = query.not("member_id", "is", null);
      return cat ? query.eq("category_id", cat) : query;
    };
    const counts = admin
      ? await Promise.all([
          countTickets().eq("status", "NEW"),
          countTickets().eq("status", "IN_PROGRESS"),
          countTickets().gte("created_at", seoulDate() + "T00:00:00+09:00"),
        ])
      : [];
    return {
      rows: data(rows),
      total: rows.count,
      counts: counts.map((c) => {
        data(c);
        return c.count;
      }),
    };
  }
  const creating = route === "create" && write;
  const segments = admin ? path.slice(1) : path;
  if (
    !creating &&
    (segments.length > 2 ||
      (segments.length === 2 && !["reply", "status"].includes(segments[1])))
  )
    denied();
  const id = creating ? randomUUID() : uuid.parse(segments[0]);
  const token =
    creating && !who.member ? randomBytes(32).toString("base64url") : null;
  let ticket: any;
  if (!creating) {
    let query = db
      .from("inquiries")
      .select(
        summary +
          ",faq_question,faq_answer,event_id,guest_application_id,guest_id,phone",
      )
      .eq("id", id);
    if (!admin) {
      const secret = req.headers.get("x-inquiry-token");
      if (secret && /^[\w-]{43}$/.test(secret))
        query = query
          .is("member_id", null)
          .eq("guest_token_hash", hash(secret));
      else if (who.member) query = query.eq("member_id", who.member.id);
      else denied();
    }
    ticket = data(await query.maybeSingle());
    if (!ticket) denied();
    if (!write && segments.length === 1) {
      const messages =
        data(
          await db
            .from("inquiry_messages")
            .select(
              "id,sender,body,created_at,inquiry_attachments(object_path)",
            )
            .eq("inquiry_id", id)
            .order("created_at"),
        ) || [];
      const thread = await Promise.all(
        messages.map(async (m) => ({
          id: m.id,
          sender: m.sender,
          body: m.body,
          created_at: m.created_at,
          images: await Promise.all(
            m.inquiry_attachments.map(
              async (a) =>
                data(
                  await db.storage
                    .from(bucket)
                    .createSignedUrl(a.object_path, 300),
                )!.signedUrl,
            ),
          ),
        })),
      );
      const payment =
        admin && ticket.guest_application_id
          ? data(
              await db
                .from("guest_payments")
                .select("status,amount")
                .eq("application_id", ticket.guest_application_id)
                .maybeSingle(),
            )
          : null;
      return { ticket, messages: thread, payment };
    }
    if (admin && write && segments[1] === "status") {
      const status = z
        .enum(["NEW", "IN_PROGRESS", "RESOLVED"])
        .parse((await req.json()).status);
      data(
        await db
          .from("inquiries")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id),
      );
      return { ok: true };
    }
    if (!write || segments[1] !== "reply") denied();
  }
  await throttle(db, req, creating ? "new" : "reply", creating ? 12 : 60);
  const form = await req.formData(),
    body = short(4000).parse(form.get("body"));
  let details = null;
  if (creating) {
    const fields = z
      .object({
        category_id: short(40),
        title: short(150),
        event_id: uuid.nullable(),
        faq_id: uuid.nullable(),
      })
      .parse({
        category_id: form.get("category"),
        title: form.get("title"),
        event_id: form.get("event") || null,
        faq_id: form.get("faq") || null,
      });
    let app: any = null;
    if (!who.member && form.get("receipt")) {
      const receipt = uuid.parse(form.get("receipt"));
      if (!validReceipt(receipt, String(form.get("proof")))) denied();
      app = data(
        await db
          .from("guest_applications")
          .select("id,guest_id,event_id,answers")
          .eq("id", receipt)
          .maybeSingle(),
      );
      if (!app || fields.event_id !== app.event_id) denied();
    }
    if (
      fields.event_id &&
      !app &&
      !data(
        await client
          .from("events")
          .select("id")
          .eq("id", fields.event_id)
          .maybeSingle(),
      )
    )
      denied();
    const name =
      who.member?.name ||
      short(80).parse(app?.answers?.name || form.get("name"));
    const phone =
      who.member?.phone ||
      z
        .string()
        .regex(/^01[0-9]{8,9}$/)
        .parse(
          normalizePhone(
            String(app?.answers?.phone || form.get("phone") || ""),
          ),
        );
    details = {
      ...fields,
      name,
      phone,
      member_id: who.member?.id || null,
      guest_id: app?.guest_id || null,
      guest_application_id: app?.id || null,
      guest_token_hash: token ? hash(token) : null,
    };
  }
  const paths: string[] = [];
  try {
    await imageUploads(db, id, form.getAll("image"), paths);
    data(
      await db.rpc("support_message", {
        p_ticket: id,
        p_new: details,
        p_sender: admin
          ? "admin"
          : (creating ? who.member : ticket.member_id)
            ? "member"
            : "guest",
        p_body: body,
        p_paths: paths,
      }),
    );
  } catch (e) {
    if (paths.length) await db.storage.from(bucket).remove(paths);
    throw e;
  }
  after(async () => {
    await deliverPush().catch(() => {});
  });
  return { id, token };
}
async function route(req: Request, ctx: Ctx) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    return Response.json(await handle(req, ctx), { headers });
  } catch (e) {
    const bad = e instanceof z.ZodError || e instanceof SyntaxError;
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : bad
              ? "입력 항목을 확인해주세요."
              : "문의센터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: e instanceof HttpError ? e.status : bad ? 400 : 503, headers },
    );
  }
}
export { route as GET, route as POST };
