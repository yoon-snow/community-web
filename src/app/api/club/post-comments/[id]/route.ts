import { z } from "zod";
import { cleanText, uuid } from "@/lib/domain";
import { serverClient, identity, HttpError } from "@/lib/supabase/server";
type Context = { params: Promise<{ id: string }> };
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
async function handle(request: Request, ctx: Context) {
  try {
    const method = request.method,
      url = new URL(request.url);
    if (method !== "GET" && request.headers.get("origin") !== url.origin)
      throw new HttpError(403, "요청 출처를 확인해주세요.");
    const db = await serverClient(),
      who = await identity(db);
    if (!who.user || !who.member)
      throw new HttpError(
        who.user ? 403 : 401,
        "회원 로그인 후 댓글을 이용해주세요.",
      );
    const data = method === "GET" ? {} : await request.json();

    const post = uuid.parse((await ctx.params).id);
    const table = db.from("post_comments");
    if (method === "GET") {
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get("page") || 0);
      const rows =
        checked(
          await table
            .select("id,body,author_id,created_at")
            .eq("post_id", post)
            .order("created_at", { ascending: false })
            .order("id")
            .range(page * 20, page * 20 + 20),
        ) || [];
      return json({
        rows: rows.slice(0, 20).map(({ author_id, ...row }) => ({
          ...row,
          mine: author_id === who.user!.id,
        })),
        more: rows.length > 20,
      });
    }
    if (method === "POST")
      checked(
        await table.insert({
          post_id: post,
          body: cleanText(1500).min(1).parse(data.body),
        }),
      );
    else if (method === "PATCH" || method === "DELETE") {
      const query =
        method === "PATCH"
          ? table.update({ body: cleanText(1500).min(1).parse(data.body) })
          : table.delete();
      checked(
        await query
          .eq("post_id", post)
          .eq("id", uuid.parse(data.id))
          .select("id")
          .single(),
      );
    } else throw new HttpError(405, "지원하지 않는 요청입니다.");
    return json({ ok: true }, method === "POST" ? 201 : 200);
  } catch (e) {
    const invalid = e instanceof z.ZodError || e instanceof SyntaxError;
    return json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : invalid
              ? "댓글 입력 내용을 확인해주세요."
              : "댓글을 처리하지 못했습니다.",
      },
      e instanceof HttpError ? e.status : invalid ? 400 : 503,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
