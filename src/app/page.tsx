import { Suspense } from "react";
import ClubApp from "@/components/club-app";
export default function Home() {
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
