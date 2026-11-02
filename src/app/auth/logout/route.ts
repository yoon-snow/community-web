import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response("Forbidden", { status: 403 });
  const db = await serverClient();
  const { error } = await db.auth.signOut();
  if (error)
    return Response.json(
      { error: "로그아웃에 실패했습니다." },
      { status: 503 },
    );
  return NextResponse.redirect(new URL("/", request.url), 303);
}
