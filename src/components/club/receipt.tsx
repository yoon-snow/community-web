"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { api, useApp, Field, SaveForm, PageTitle } from "./core";
import {
  formatDate,
  formatTime,
  normalizePhone,
  type ClubRow,
} from "@/lib/domain";

export function ReceiptScreen() {
  const { boot, link } = useApp();
  const [applications, setApplications] = useState<ClubRow[] | null>(null);
  return (
    <>
      <PageTitle
        title="내 게스트 신청 확인"
        description="신청할 때 입력한 휴대전화번호로 최근 신청 10건의 입금 상태를 확인하세요."
      />
      <SaveForm
        submit="신청 확인"
        onSubmit={async (form) => {
          setApplications(null);
          const phone = normalizePhone(String(form.get("phone") || ""));
          if (!/^01[016789]\d{7,8}$/.test(phone))
            throw new Error("휴대전화번호를 확인해주세요.");
          if (boot.preview) {
            setApplications(
              phone === "01000000000"
                ? boot.events
                    .slice(0, 2)
                    .map((event: ClubRow, i: number) => ({
                      event,
                      paid: i === 1,
                    }))
                : [],
            );
            return;
          }
          const result = await api("/api/support/receipt", {
            method: "POST",
            body: JSON.stringify({ phone }),
          });
          setApplications(result.applications);
        }}
      >
        <Field
          label="신청 연락처"
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="010-0000-0000"
          value={boot.preview ? "010-0000-0000" : undefined}
          required
        />
      </SaveForm>
      {applications && (
        <section className="receipt-results" aria-live="polite">
          {applications.length === 0 && (
            <p className="card">
              이 번호로 접수된 신청이 없습니다. 신청 당시 연락처를 확인해주세요.
            </p>
          )}
          {applications.map(({ event, paid }, i) => (
            <article
              className={"card receipt-state " + (paid ? "paid" : "pending")}
              key={i}
            >
              <strong className="receipt-status">
                {paid ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <Clock aria-hidden="true" />
                )}
                {paid ? "입금완료" : "입금확인 전"}
              </strong>
              <h2>{event.title}</h2>
              <p>
                {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
                {event.status === "cancelled" && " · 운동 취소"}
              </p>
              <small>
                {paid
                  ? "운영진이 입금을 확인했습니다."
                  : "운영진의 입금 확인을 기다리고 있습니다."}
              </small>
            </article>
          ))}
          <Link
            className="button secondary full"
            href={link("/support?category=payment")}
          >
            입금 관련 문의
          </Link>
        </section>
      )}
    </>
  );
}
