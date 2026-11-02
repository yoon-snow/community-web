import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export async function serverClient() {
  if (!configured()) throw new Error("SETUP_REQUIRED");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server Component writes are handled by proxy. */
          }
        },
      },
    },
  );
}
export function serviceClient() {
  if (!configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SETUP_REQUIRED");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function identity(db: Awaited<ReturnType<typeof serverClient>>) {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { user: null, member: null, admin: false };
  const { data: member, error } = await db
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error)
    throw new HttpError(
      503,
      "회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
  const { data: admin } = member
    ? await db
        .from("admins")
        .select("titles")
        .eq("member_id", member.id)
        .maybeSingle()
    : { data: null };
  return { user, member, admin: Boolean(admin), titles: admin?.titles || [] };
}
