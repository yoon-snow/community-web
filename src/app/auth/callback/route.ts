import { NextResponse } from "next/server";
import { serverClient, identity } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_URL || url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await serverClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) {
        const who = await identity(db);
        return NextResponse.redirect(
          new URL(who.admin ? "/admin" : who.member ? "/" : "/join", origin),
        );
      }
    } catch {
      /* Safe login error below. */
    }
  }
  return NextResponse.redirect(new URL("/account?error=auth", origin));
}
