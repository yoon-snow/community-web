import { NextResponse } from "next/server";
import { serverClient, identity } from "@/lib/supabase/server";
import { accountDestination } from "@/lib/account-auth";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = new URL(process.env.APP_URL || url.origin).origin;
  const token = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let target = "/account?error=auth";
  if (
    token &&
    token.length <= 2048 &&
    (type === "email" || type === "signup" || type === "recovery")
  ) {
    try {
      const db = await serverClient();
      const { data, error } = await db.auth.verifyOtp({
        token_hash: token,
        type,
      });
      if (!error) {
        if (type === "recovery" && data.user) target = "/reset-password";
        else {
          const who = await identity(db);
          if (who.user) target = accountDestination(who);
        }
      }
    } catch {
      /* Fixed, credential-free error target. */
    }
  }
  const response = NextResponse.redirect(new URL(target, origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
