"use client";
import Link from "next/link";
import { useState } from "react";
import {
  guestAgeGroup,
  formatDate,
  seoulDate,
  type ClubRow,
} from "@/lib/domain";
import { useApp, useResource, Resource, Chips, Badge } from "./core";
export function DailyGuests() {
  const { link } = useApp();
  const resource = useResource("admin/daily-guests");
  const [filter, setFilter] = useState("all");
  const [payments, setPayments] = useState<Record<string, string>>({});
  const today = seoulDate();
  return (
    <section className="daily-guests">
      <h2>오늘 · 다음 운동 게스트</h2>
      <p className="micro">
        신청 이름·생년월일·희망 포지션·경력 / 현재 한국 날짜 기준 만 19세 이상은
        성인으로 표시합니다.
      </p>
      <Chips
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "전체" },
          { value: "adult", label: "성인" },
          { value: "minor", label: "미성년" },
          { value: "unknown", label: "생년월일 확인 필요" },
        ]}
      />
      <Resource resource={resource}>
        {(days: ClubRow[]) =>
          days.map((day, i) => (
            <section key={day.day || i} className="card">
              <h3>
                {i === 0 ? "오늘" : "다음 운동일"}
                {day.day && " · " + formatDate(day.day + "T12:00:00+09:00")}
              </h3>
              {!day.events.length && (
                <p className="micro">등록된 운동이 없습니다.</p>
              )}
              {day.events.map((event: ClubRow) => {
                const guests: ClubRow[] = event.applications;
                const paid = guests.filter((g) => g.payment === "paid").length;
                const payment = payments[event.id] || "all";
                const rows = guests
                  .filter(
                    (g) =>
                      payment === "all" ||
                      (payment === "paid") === (g.payment === "paid"),
                  )
                  .filter(
                    (g: ClubRow) =>
                      filter === "all" ||
                      guestAgeGroup(g.birth_date, today) === filter,
                  );
                return (
                  <div key={event.id}>
                    <h4>{event.title}</h4>
                    <Chips
                      value={payment}
                      onChange={(v) =>
                        setPayments((prev) => ({ ...prev, [event.id]: v }))
                      }
                      items={[
                        { value: "all", label: `신청 ${guests.length}명` },
                        { value: "paid", label: `입금완료 ${paid}명` },
                        {
                          value: "pending",
                          label: `확인 전 ${guests.length - paid}명`,
                        },
                      ]}
                    />
                    {rows.length ? (
                      rows.map((g: ClubRow) => (
                        <Link
                          className="daily-guest"
                          href={link("/admin/guests?application=" + g.id)}
                          key={g.id}
                        >
                          <div>
                            <span className="guest-summary">
                              <strong>{g.name}</strong> ·{" "}
                              {g.position || "포지션 미입력"} ·{" "}
                              {g.experience || "경력 미입력"}
                            </span>
                            <Badge
                              tone={g.payment === "paid" ? "green" : "warning"}
                            >
                              {g.payment === "paid"
                                ? "입금완료"
                                : "입금확인 전"}
                            </Badge>
                          </div>
                          <small>
                            {
                              {
                                adult: "성인",
                                minor: "미성년 · 참여 대상 제외",
                                unknown: "생년월일 확인 필요",
                              }[guestAgeGroup(g.birth_date, today)]
                            }
                            · {g.birth_date || "생년월일 미입력"}
                          </small>
                        </Link>
                      ))
                    ) : (
                      <p className="micro">
                        {event.applications.length
                          ? "선택한 조건에 해당하는 신청이 없습니다."
                          : "아직 신청이 없습니다."}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          ))
        }
      </Resource>
    </section>
  );
}
