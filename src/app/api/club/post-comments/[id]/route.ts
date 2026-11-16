import { z } from "zod";
import { cleanText, uuid } from "@/lib/domain";
import {
  serverClient,
  serviceClient,
  identity,
  HttpError,
} from "@/lib/supabase/server";
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
      const parent = url.searchParams.get("parent");
      const list = table
        .select("id,body,author_id,created_at")
        .eq("post_id", post);
      const rows =
        checked(
          await (
            parent
              ? list.eq("parent_id", uuid.parse(parent))
              : list.is("parent_id", null)
          )
            .order("created_at", { ascending: Boolean(parent) })
            .order("id")
            .range(page * 20, page * 20 + 20),
        ) || [];
      const visible = rows.slice(0, 20);
      const profiles = new Map<
        string,
        { name: string; avatar_url: string | null }
      >();
      if (visible.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        // Resolve only authors of comments returned by the viewer's RLS-scoped query.
        const service = serviceClient();
        const { data: members } = await service
          .from("members")
          .select("id,user_id,name,avatar_path")
          .eq("status", "active")
          .in("user_id", [...new Set(visible.map((row) => row.author_id))]);
        const paths = new Map<string, string>();
        for (const m of members || []) {
          profiles.set(m.user_id, { name: m.name, avatar_url: null });
          const path = m.avatar_path || "";
          const directory = path.slice(0, path.lastIndexOf("/"));
          if (
            (directory === m.user_id || directory === "managed/" + m.id) &&
            /^[a-f0-9-]+\.(jpeg|jpg|png|webp)$/i.test(
              path.slice(path.lastIndexOf("/") + 1),
            )
          )
            paths.set(path, m.user_id);
        }
        if (paths.size) {
          const signed = await service.storage
            .from("avatars")
            .createSignedUrls([...paths.keys()], 600);
          for (const item of signed.data || []) {
            const profile = profiles.get(paths.get(item.path || "") || "");
            if (profile && item.signedUrl) profile.avatar_url = item.signedUrl;
          }
        }
      }
      return json({
        rows: visible.map(({ author_id, ...row }) => ({
          ...row,
          author: profiles.get(author_id) || { name: "회원", avatar_url: null },
          mine: author_id === who.user!.id,
        })),
        more: rows.length > 20,
      });
    }
    if (method === "POST")
      checked(
        await table.insert({
          post_id: post,
          parent_id: data.parent_id == null ? null : uuid.parse(data.parent_id),
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
