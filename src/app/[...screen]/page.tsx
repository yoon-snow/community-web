import { Suspense } from "react";
import ClubApp from "@/components/club-app";
import { configured, identity, serverClient } from "@/lib/supabase/server";
export default async function Screen({
  params,
}: {
  params: Promise<{ screen: string[] }>;
}) {
  const { screen } = await params;
  if (
    screen[0] === "preview" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_PREVIEW !== "true"
  ) {
    const admin = configured() && (await identity(await serverClient())).admin;
    if (!admin)
      return (
        <main className="content">
          <h1>운영진 미리보기</h1>
          <a href="/account">운영진 계정으로 로그인</a>
        </main>
      );
  }

  return (
    <Suspense
      fallback={
        <div className="initial-loading">SpotLight를 불러오고 있어요…</div>
      }
    >
      <ClubApp />
    </Suspense>
  );
}
