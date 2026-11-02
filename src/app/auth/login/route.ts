import { NextResponse } from "next/server";
import { configured } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const origin = process.env.APP_URL || new URL(request.url).origin;
  if (!configured())
    return NextResponse.redirect(new URL("/account?error=setup", origin));
  return NextResponse.redirect(new URL("/account", origin));
}
