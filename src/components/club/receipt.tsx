"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApp, Field, SaveForm, PageTitle } from "./core";
import { formatDate, formatTime, type ClubRow } from "@/lib/domain";

export function ReceiptScreen() {
  const { boot, link } = useApp();
  const [saved] = useState(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("spot-support-application") || "null",
      );
    } catch {
      return null;
    }
  });
  const [result, setResult] = useState<ClubRow | null>(null);
  return (
    <>
      <PageTitle
        title="내 게스트 신청 확인"
        description="접수번호와 신청할 때 입력한 연락처로 입금 확인 상태를 조회하세요."
      />
      <SaveForm
        submit="신청 상태 확인"
        onSubmit={async (f) => {
          setResult(null);
          if (boot.preview) {
            setResult({
              receipt: "미리보기",
              event: boot.events[0],
              payment: { status: "pending", amount: 5000 },
              self_reported_paid: true,
            });
            return;
          }
          const id = String(f.get("id")).trim();
          setResult(
            await api("/api/support/receipt", {
              method: "POST",
              body: JSON.stringify({
                id,
                phone: f.get("phone"),
                proof: id === saved?.id ? saved.proof : undefined,
              }),
            }),
          );
        }}
      >
        <Field
          label="접수번호"
          name="id"
          value={boot.preview ? "미리보기" : saved?.id}
          required
        />
        <Field
          label="신청 연락처"
          type="tel"
          name="phone"
          value={boot.preview ? "010-0000-0000" : saved?.phone}
          required
        />
      </SaveForm>
      {result && (
        <section className="card prose" role="status">
          <h2>신청 접수 완료</h2>
          <p>
            {result.event.title} · {formatDate(result.event.starts_at)}{" "}
            {formatTime(result.event.starts_at)}
          </p>
          <p>
            {result.event.location}
            {result.event.status === "cancelled" ? " · 운동 취소" : ""}
          </p>
          <strong>
            {result.payment?.status === "paid" ? "입금완료" : "입금확인 전"}
          </strong>
          <p>
            신청 당시 입금 응답 ·{" "}
            {result.self_reported_paid
              ? "입금했습니다"
              : "아직 입금하지 않았습니다"}
          </p>
          <Link
            className="text-button"
            href={link("/support?category=payment")}
          >
            입금 관련 문의
          </Link>
        </section>
      )}
    </>
  );
}
