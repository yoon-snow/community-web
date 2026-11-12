"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useApp } from "./core";
import dynamic from "next/dynamic";
const ContextFaqs = dynamic(() =>
  import("./support").then((m) => m.ContextFaqs),
);
export function SupportLinks({ category }: { category?: string }) {
  const { link, boot } = useApp();
  return (
    <section className="card support-links">
      <strong>{category ? "도움이 필요하신가요?" : "문의센터"}</strong>
      {!boot.member && !category && (
        <Link href={link("/receipt")}>
          내 게스트 신청 조회 <ChevronRight size={16} />
        </Link>
      )}
      {category && <ContextFaqs category={category} />}
      <Link href={link("/support" + (category ? "?category=" + category : ""))}>
        문의하기
        <ChevronRight size={16} />
      </Link>
    </section>
  );
}
