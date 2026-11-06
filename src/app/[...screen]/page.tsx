import { Suspense } from "react";
import ClubApp from "@/components/club-app";
// Preview uses bundled fixtures; live data access remains protected by API/RLS.
export default function Screen() {
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
