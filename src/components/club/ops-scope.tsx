"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "./core";
export function useOpsScope() {
  return useSearchParams().get("scope") === "member" ? "member" : "guest";
}
export function OpsSwitch({ path }: { path: string }) {
  const scope = useOpsScope();
  const { link } = useApp();
  return (
    <nav className="ops-switch" aria-label="운영 대상">
      {(["guest", "member"] as const).map((key) => (
        <Link
          key={key}
          className={"button " + (key === scope ? "primary" : "secondary")}
          aria-current={key === scope ? "page" : undefined}
          href={link(path + "?scope=" + key)}
        >
          {key === "guest" ? "게스트 관리" : "회원 관리"}
        </Link>
      ))}
    </nav>
  );
}
