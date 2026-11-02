import { NextResponse } from "next/server";
import { serverClient, identity } from "@/lib/supabase/server";
import { accountDestination } from "@/lib/account-auth";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_URL || url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await serverClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) {
        const who =
          url.searchParams.get("flow") === "recovery"
            ? await db.auth
                .getUser()
                .then((result) => ({
                  user: result.error ? null : result.data.user,
                  member: null,
                  admin: false,
                }))
            : await identity(db);
        if (who.user) {
          const response = NextResponse.redirect(
            new URL(
              url.searchParams.get("flow") === "recovery"
                ? "/reset-password"
                : accountDestination(who),
              origin,
            ),
          );
          response.headers.set("Cache-Control", "private, no-store");
          response.headers.set("Referrer-Policy", "no-referrer");
          return response;
        }
      }
    } catch {
      /* Safe login error below. */
    }
  }
  const response = NextResponse.redirect(new URL("/account?error=auth", origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
