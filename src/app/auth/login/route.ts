import { NextResponse } from "next/server";
import { configured, serverClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const origin = process.env.APP_URL || new URL(request.url).origin;
  if (!configured())
    return NextResponse.redirect(new URL("/account?error=setup", origin));
  const db = await serverClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url)
    return NextResponse.redirect(new URL("/account?error=auth", origin));
  return NextResponse.redirect(data.url);
}
