import { serverClient, identity } from "@/lib/supabase/server";

export async function GET() {
  const db = await serverClient();
  const { data, error } = await db
    .from("schedule_kinds")
    .select("key")
    .eq("archived", true);
  return error
    ? Response.json(
        { error: "종류 목록을 불러오지 못했습니다." },
        { status: 503 },
      )
    : Response.json(
        data.map((k) => k.key),
        { headers: { "Cache-Control": "no-store" } },
      );
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "요청 출처를 확인해주세요." },
      { status: 403 },
    );
  const db = await serverClient();
  if (!(await identity(db)).admin)
    return Response.json(
      { error: "운영진 권한이 필요합니다." },
      { status: 403 },
    );
  const input = await request.json().catch(() => null);
  if (
    typeof input?.key !== "string" ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(input.key)
  )
    return Response.json({ error: "종류를 선택해주세요." }, { status: 400 });
  const { error } = await db
    .from("schedule_kinds")
    .update({ archived: true })
    .eq("key", input.key)
    .select("key")
    .single();
  return error
    ? Response.json({ error: "종류를 삭제하지 못했습니다." }, { status: 400 })
    : Response.json({ ok: true });
}
