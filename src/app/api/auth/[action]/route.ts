import { z } from "zod";
import { configured, serverClient, identity } from "@/lib/supabase/server";
import {
  authEmail,
  signInInput,
  signUpInput,
  updatePasswordInput,
  accountDestination,
} from "@/lib/account-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
function limited(error: { status?: number; code?: string }) {
  return error.status === 429 || /rate_limit/.test(error.code || "");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return json({ error: "요청 출처를 확인할 수 없습니다." }, 403);
    const { action } = await context.params;
    if (
      !["signin", "signup", "request-reset", "update-password"].includes(action)
    )
      return json({ error: "요청을 찾을 수 없습니다." }, 404);
    if (!configured())
      return json(
        {
          error: "로그인 서비스 연결을 준비 중입니다. 운영진에게 문의해주세요.",
        },
        503,
      );
    if (Number(request.headers.get("content-length") || 0) > 16_384)
      return json({ error: "입력 내용이 너무 깁니다." }, 413);
    const text = await request.text();
    if (text.length > 16_384)
      return json({ error: "입력 내용이 너무 깁니다." }, 413);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: "입력 형식을 확인해주세요." }, 400);
    }
    const db = await serverClient();
    const origin = new URL(process.env.APP_URL || request.url).origin;
    if (action === "signin") {
      const input = signInInput.parse(data);
      const { error } = await db.auth.signInWithPassword(input);
      if (error)
        return limited(error)
          ? json({ error: "시도가 많습니다. 잠시 후 다시 시도해주세요." }, 429)
          : error.status && error.status >= 500
            ? json(
                {
                  error:
                    "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
                },
                503,
              )
            : json(
                {
                  error:
                    "이메일 또는 비밀번호를 확인해주세요. 가입 확인 메일의 인증도 완료해야 합니다.",
                },
                401,
              );
      const who = await identity(db);
      if (!who.user)
        return json(
          { error: "로그인을 완료하지 못했습니다. 다시 시도해주세요." },
          401,
        );
      return json({ next: accountDestination(who) });
    }
    if (action === "signup") {
      const { email, password } = signUpInput.parse(data);
      const { data: result, error } = await db.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) {
        if (limited(error))
          return json(
            { error: "메일 발송 시도가 많습니다. 잠시 후 다시 시도해주세요." },
            429,
          );
        if (error.code !== "user_already_exists")
          return json(
            {
              error:
                "계정 생성 안내를 보내지 못했습니다. 잠시 후 다시 시도해주세요.",
            },
            503,
          );
      }
      if (!error && result.session) {
        const who = await identity(db);
        if (!who.user)
          return json(
            { error: "계정을 확인하지 못했습니다. 다시 로그인해주세요." },
            401,
          );
        return json({ next: accountDestination(who) }, 201);
      }
      return json(
        {
          message:
            "이메일을 확인해주세요. 가입 가능한 주소라면 확인 메일이 도착합니다. 이미 계정이 있다면 로그인하거나 비밀번호를 재설정해주세요.",
        },
        201,
      );
    }
    if (action === "request-reset") {
      const { email } = z.object({ email: authEmail }).parse(data);
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?flow=recovery`,
      });
      if (error)
        return limited(error)
          ? json(
              {
                error: "메일 발송 시도가 많습니다. 잠시 후 다시 시도해주세요.",
              },
              429,
            )
          : json(
              {
                error:
                  "안내 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.",
              },
              503,
            );
      return json({
        message:
          "입력한 이메일로 가입된 계정이 있다면 비밀번호 재설정 메일이 발송됩니다. 메일의 링크를 열어 새 비밀번호를 설정해주세요.",
      });
    }
    const { password } = updatePasswordInput.parse(data);
    const { data: userData, error: userError } = await db.auth.getUser();
    if (userError || !userData.user)
      return json(
        { error: "비밀번호 재설정 메일의 링크를 다시 열어주세요." },
        401,
      );
    const { error } = await db.auth.updateUser({ password });
    if (error)
      return json(
        {
          error:
            "비밀번호를 변경하지 못했습니다. 기존 비밀번호와 다르게 입력하거나 새 재설정 메일을 요청해주세요.",
        },
        400,
      );
    const { error: logoutError } = await db.auth.signOut({ scope: "global" });
    return json({
      next: "/account?password=updated",
      message: logoutError
        ? "비밀번호가 변경되었습니다. 로그아웃 후 다시 로그인해주세요."
        : "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.",
    });
  } catch (e) {
    if (e instanceof z.ZodError)
      return json(
        { error: e.issues[0]?.message || "입력 내용을 확인해주세요." },
        400,
      );
    // Never echo provider errors, submitted credentials, session tokens or account metadata.
    return json(
      {
        error: "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      503,
    );
  }
}
