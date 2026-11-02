"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDate, seoulDate, type ClubRow } from "@/lib/domain";
import {
  useResource,
  Resource,
  Field,
  Stats,
  Badge,
  Empty,
  Pagination,
  SectionTitle,
} from "./core";

export function AttendanceHistory({
  admin = false,
  memberId = "",
}: {
  admin?: boolean;
  memberId?: string;
}) {
  const currentYear = Number(seoulDate().slice(0, 4));
  const [year, setYear] = useState(String(currentYear));
  const [page, setPage] = useState(0);
  const resource = useResource(
    admin
      ? memberId
        ? `admin/attendance-report?member=${memberId}&year=${year}&page=${page}`
        : null
      : `my-attendance?year=${year}&page=${page}`,
  );
  return (
    <>
      <Field
        label="출석 연도"
        name="attendance_year"
        value={year}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          setYear(e.target.value);
          setPage(0);
        }}
      >
        {Array.from({ length: currentYear - 1898 }, (_, i) =>
          String(currentYear + 1 - i),
        ).map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </Field>
      {admin && !memberId && (
        <Empty title="출석 기록을 확인할 회원을 선택해주세요" />
      )}
      <Resource resource={resource}>
        {(d) => (
          <>
            <Stats
              items={[
                {
                  label: `${year}년 총 출석`,
                  value: `${d.summary.year_attendance}회`,
                },
                {
                  label: "최근 참석일",
                  value: d.summary.last_attended_at
                    ? formatDate(d.summary.last_attended_at, {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                      })
                    : "—",
                },
              ]}
            />
            <SectionTitle title="월별 출석 횟수" />
            <dl className="attendance-months" aria-label="월별 실제 출석">
              {d.summary.months.map((m: ClubRow) => (
                <div key={m.month}>
                  <dt>{m.month}월</dt>
                  <dd>
                    {m.count}
                    <small>회</small>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="micro">
              운동 종료 후 운영진이 실제 출석을 확인한 횟수입니다. 참석
              응답만으로 출석 횟수가 올라가지 않습니다. 최근 참석일은 전체 기간
              기준입니다.
            </p>
            <SectionTitle title="출석 기록" />
            {d.rows.length ? (
              d.rows.map((a: ClubRow) => (
                <div className="list-card" key={a.id}>
                  <span className="list-icon">
                    <CalendarDays size={21} />
                  </span>
                  <div>
                    <strong>{formatDate(a.events.starts_at)}</strong>
                    <small>{a.events.title}</small>
                    <small>
                      사전 응답:{" "}
                      {a.response === "yes"
                        ? "참석"
                        : a.response === "no"
                          ? "불참"
                          : "미응답"}
                    </small>
                  </div>
                  <Badge tone={a.actual === true ? "green" : "neutral"}>
                    {a.actual === true
                      ? "출석 확정"
                      : a.actual === false
                        ? "불참 확정"
                        : "출석 미확인"}
                  </Badge>
                </div>
              ))
            ) : (
              <Empty title="이 연도의 출석 기록이 없어요" />
            )}
            <Pagination page={page} total={d.total} setPage={setPage} />
          </>
        )}
      </Resource>
    </>
  );
}
