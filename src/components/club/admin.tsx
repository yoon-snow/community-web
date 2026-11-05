"use client";
import Link from "next/link";
import { AttendanceHistory } from "./attendance";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  FileUp,
  Play,
  Plus,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Shirt,
  UserRound,
  Users,
  Wallet,
  AlertCircle,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import {
  formatDate,
  formatTime,
  seoulDate,
  type ClubRow,
  type ClubEvent,
} from "@/lib/domain";

import {
  useApp,
  useResource,
  Empty,
  Resource,
  Badge,
  Avatar,
  SectionTitle,
  Modal,
  SaveForm,
  Field,
  Chips,
  Stats,
  PageTitle,
  Menu,
  Pagination,
  paymentLabel,
} from "./core";
import { Emergency, EventCard, NoticeCard } from "./public";
import { ExportSheet } from "./operations";
import { NoticeEditor } from "./admin-forms";

export function AdminHome() {
  const { boot, link } = useApp();
  const [selectedEvent, setSelectedEvent] = useState("");
  const dashboard = useResource(
    `admin/dashboard${selectedEvent ? `?event=${selectedEvent}` : ""}`,
  );
  return (
    <>
      <Emergency />
      <PageTitle
        eyebrow="CLUB OPERATIONS"
        title="오늘도, 함께 빛나게"
        description={`${boot.member?.name || "운영진"}님, 오늘의 운영 현황이에요.`}
      />
      <Resource resource={dashboard}>
        {(d) => {
          const event = d.event;
          const choices = Array.from(
            new Map(
              [
                ...d.today_events,
                ...(event ? [event] : []),
                ...boot.events.filter(
                  (e: ClubEvent) =>
                    ["scheduled", "completed"].includes(e.status) &&
                    e.kind !== "holiday",
                ),
              ].map((e: ClubEvent) => [e.id, e]),
            ).values(),
          ) as ClubEvent[];
          return (
            <>
              <SectionTitle
                title={
                  event && seoulDate(event.starts_at) === seoulDate()
                    ? "오늘 운동"
                    : "다음 운동"
                }
                href="/admin/calendar"
              />
              {!d.today_events.length && (
                <p className="micro">오늘 등록된 운동은 없습니다.</p>
              )}
              {choices.length > 1 && (
                <Field
                  label="집계할 운동"
                  name="dashboard_event"
                  value={event?.id || ""}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedEvent(e.target.value)
                  }
                >
                  {choices.map((e) => (
                    <option value={e.id} key={e.id}>
                      {formatDate(e.starts_at)} · {e.title}
                    </option>
                  ))}
                </Field>
              )}
              {event ? (
                <>
                  <EventCard event={event} featured />
                  <div aria-label="관리자 참가 현황">
                    <Stats
                      items={[
                        { label: "회원 참석 예정", value: d.counts.members },
                        {
                          label: "게스트 전체 신청",
                          value: d.guest_summary.applications,
                        },
                        {
                          label: "게스트 입금완료",
                          value: d.guest_summary.paid,
                        },
                        {
                          label: "게스트 입금확인 전",
                          value: d.guest_summary.pending,
                        },
                        { label: "전체 예상 참가 인원", value: d.counts.total },
                      ]}
                    />
                  </div>
                  <p className="micro">
                    전체 예상 참가 인원은 참석 응답 회원과 입금완료 게스트의
                    합계입니다.
                  </p>
                </>
              ) : (
                <Empty icon={CalendarDays} title="예정된 운동이 없어요" />
              )}
              <SectionTitle title="해야 할 일" />
              <div className="task-list">
                {[
                  {
                    href: "/admin/guests?status=pending",
                    label: "게스트 입금확인",
                    value: d.tasks.pending_guests,
                    unit: "건",
                    icon: Wallet,
                  },
                  {
                    href: "/admin/members",
                    label: "신규 회원가입",
                    value: d.tasks.pending_members,
                    unit: "건",
                    icon: UserRound,
                  },
                  {
                    href: "/admin/dues?status=unpaid",
                    label: "이번 달 회비 미납",
                    value: d.tasks.unpaid_members,
                    unit: "명",
                    icon: AlertCircle,
                  },
                  {
                    href: event
                      ? `/admin/attendance?event=${event.id}&response=unanswered`
                      : "/admin/calendar",
                    label: "회원 참석 미응답",
                    value: d.tasks.unanswered,
                    unit: "명",
                    icon: CalendarDays,
                  },
                ].map((item, index) => (
                  <Link href={link(item.href)} key={item.label}>
                    <span className={`task-icon task-${index}`}>
                      <item.icon size={18} />
                    </span>
                    <span>{item.label}</span>
                    <Badge tone={item.value ? "gold" : "neutral"}>
                      {item.value}
                      {item.unit}
                    </Badge>
                    <ChevronRight size={17} />
                  </Link>
                ))}
              </div>
              <SectionTitle title="최근 게스트 신청 5건" href="/admin/guests" />
              {d.recent_guests.length ? (
                d.recent_guests
                  .slice(0, 5)
                  .map((g: ClubRow) => <GuestCard key={g.id} guest={g} />)
              ) : (
                <Empty icon={Users} title="새 게스트 신청이 없어요" />
              )}
            </>
          );
        }}
      </Resource>
    </>
  );
}

export function AdminGuests() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "all");
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [event, setEvent] = useState(params.get("event") || "");
  const application = params.get("application");
  const selected = useResource(
    application ? `admin/guests/${application}` : null,
  );
  const [exporting, setExporting] = useState(false);
  const { boot } = useApp();
  const query = `status=${status}&from=${from}&to=${to}&event=${event}`;
  const resource = useResource(`admin/guests?${query}&page=${page}`);
  return (
    <>
      <PageTitle
        eyebrow="GUEST MANAGEMENT"
        title="게스트"
        description="실제 입금을 확인한 뒤 참가를 확정해주세요."
        action={
          <button
            className="icon-button bordered"
            aria-label="게스트 내보내기"
            onClick={() => setExporting(true)}
          >
            <Download size={20} />
          </button>
        }
      />
      {application && (
        <Resource resource={selected}>
          {(g) => (
            <>
              <SectionTitle title="알림에서 확인 중인 신청" />
              <GuestCard guest={g} initiallyOpen />
            </>
          )}
        </Resource>
      )}
      <Chips
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(0);
        }}
        items={[
          { value: "all", label: "전체" },
          { value: "pending", label: "입금확인 전" },
          { value: "paid", label: "입금완료" },
        ]}
      />
      <details className="filter-details">
        <summary>
          <SlidersHorizontal size={15} />
          기간·일정 필터
        </summary>
        <div className="filter-row">
          <input
            aria-label="시작 날짜"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
          <input
            aria-label="종료 날짜"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Field
          label="운동 일정"
          name="event"
          value={event}
          onChange={(e: any) => {
            setEvent(e.target.value);
            setPage(0);
          }}
        >
          <option value="">모든 일정</option>
          {boot.events.map((e: ClubEvent) => (
            <option key={e.id} value={e.id}>
              {formatDate(e.starts_at)} {e.title}
            </option>
          ))}
        </Field>
      </details>
      <Resource resource={resource}>
        {(d) => (
          <>
            <div className="card" aria-label="게스트 신청 집계">
              <div className="count-row">
                <span>
                  신청 <b>{d.summary?.applications || 0}</b>
                </span>
                <span>
                  입금완료 <b>{d.summary?.paid || 0}</b>
                </span>
                <span>
                  입금확인 전 <b>{d.summary?.pending || 0}</b>
                </span>
              </div>
              <p className="micro">
                선택한 기간·일정 기준입니다. 상태 필터는 아래 목록에 적용됩니다.
              </p>
            </div>
            <p className="list-count">
              현재 목록 <strong>{d.total}</strong>건
            </p>
            {d.rows.length ? (
              d.rows
                .filter((g: ClubRow) => g.id !== application)
                .map((g: ClubRow) => <GuestCard guest={g} key={g.id} />)
            ) : (
              <Empty icon={Users} title="조건에 맞는 신청이 없어요" />
            )}
            <Pagination page={page} total={d.total} setPage={setPage} />
          </>
        )}
      </Resource>
      {exporting && (
        <ExportSheet
          resource="guests"
          query={query}
          close={() => setExporting(false)}
        />
      )}
    </>
  );
}

export function GuestCard({
  guest: g,
  initiallyOpen = false,
}: {
  guest: ClubRow;
  initiallyOpen?: boolean;
}) {
  const { mutate, toast } = useApp();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const history = useResource(
    open && g.guests?.id ? `admin/guests/${g.guests.id}/history` : null,
  );
  const payment = Array.isArray(g.guest_payments)
    ? g.guest_payments[0]
    : g.guest_payments;
  const paid = payment?.status === "paid";
  return (
    <>
      <div className="guest-card card">
        <div className="guest-card-top">
          <Avatar member={g.guests || { name: "게스트" }} />
          <div>
            <button className="name-button" onClick={() => setOpen(true)}>
              {g.answers.name || g.guests?.name}
            </button>
            <p>
              {g.answers.position || g.guests?.position} · 구력{" "}
              {g.answers.experience || "미입력"}
            </p>
          </div>
          <Badge tone={paid ? "green" : "warning"}>
            {paid ? "입금완료" : "입금확인 전"}
          </Badge>
        </div>
        <p className="micro">
          성별 {g.answers.gender || "미입력"} · 연락처{" "}
          {g.answers.phone || g.guests?.phone || "미입력"}
        </p>
        <div className="guest-event">
          <CalendarDays size={16} />
          {g.events
            ? `${formatDate(g.events.starts_at)} · ${g.events.title}`
            : "연결 일정 없음"}
        </div>
        <p className="micro">
          신청{" "}
          {formatDate(g.submitted_at, {
            year: "numeric",
            month: "numeric",
            day: "numeric",
          })}{" "}
          {formatTime(g.submitted_at)}
        </p>
        <div className="detail-line">
          <small>
            본인 응답: {g.self_reported_paid ? "입금했습니다" : "입금 전"}
          </small>
          <strong>{payment?.amount?.toLocaleString()}원</strong>
        </div>
        {!paid && (
          <button
            className="button primary full"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  `${g.guests?.name}님의 실제 계좌 입금을 확인하셨나요?`,
                )
              )
                return;
              setBusy(true);
              try {
                await mutate("admin/payments/confirm", {
                  application_id: g.id,
                });
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check size={17} />
            {busy ? "확인 중…" : "입금확인"}
          </button>
        )}
      </div>
      {open && (
        <Modal title="게스트 신청 상세" close={() => setOpen(false)}>
          <div className="prose">
            <h3>{g.answers.name || g.guests?.name}</h3>
            <p>
              포지션: {g.answers.position || g.guests?.position} · 구력:{" "}
              {g.answers.experience || "미입력"}
            </p>
            <p>
              신청 일시:{" "}
              {formatDate(g.submitted_at, {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              })}{" "}
              {formatTime(g.submitted_at)} (한국 시간)
            </p>
            <p>입금 상태: {paid ? "입금완료" : "입금확인 전"}</p>
            <p>연락처: {g.guests?.phone}</p>
            <p>성별: {g.answers.gender || "미입력"}</p>
            <p>생년월일: {g.answers.birth_date}</p>
            <p>유입 경로: {g.answers.source || "미입력"}</p>
            <p>{g.answers.notes || "추가 문의 없음"}</p>
            <SectionTitle title="방문 기록" />
            <Resource resource={history}>
              {(h) => (
                <>
                  <Stats
                    items={[
                      { label: "총 신청", value: h.applications },
                      { label: "확인된 방문", value: h.total_visits },
                    ]}
                  />
                  <p>
                    최근 방문:{" "}
                    {h.last_visited_at
                      ? formatDate(h.last_visited_at, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "확인된 방문 없음"}
                  </p>
                  <p className="micro">
                    정규화된 전화번호로 연결합니다. 신청·입금만으로 방문 횟수를
                    올리지 않습니다. 과거 자료의 출석 미확인 건은 포함하지
                    않습니다.
                  </p>
                  {h.recent?.map((r: ClubRow) => (
                    <div className="detail-line" key={r.id}>
                      <span>
                        {formatDate(r.starts_at)} · {r.title}
                      </span>
                      <small>
                        {r.actual_attended === true
                          ? "방문 확인"
                          : r.actual_attended === false
                            ? "불참 확인"
                            : "출석 미확인"}
                      </small>
                    </div>
                  ))}
                </>
              )}
            </Resource>
            {paid &&
              g.events?.ends_at &&
              new Date(g.events.ends_at) <= new Date() &&
              ["scheduled", "completed"].includes(g.events.status) && (
                <>
                  <p>
                    이 신청의 실제 참석:{" "}
                    {g.actual_attended === true
                      ? "참석"
                      : g.actual_attended === false
                        ? "불참"
                        : "미확인"}
                  </p>
                  <div className="button-row">
                    {[true, false].map((actual) => (
                      <button
                        key={String(actual)}
                        className="button secondary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await mutate("admin/guests/attendance", {
                              application_id: g.id,
                              actual,
                            });
                          } catch (e) {
                            toast((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {actual ? "방문 확인" : "불참 확인"}
                      </button>
                    ))}
                  </div>
                </>
              )}
            {g.question_snapshot?.length > 0 && (
              <details>
                <summary>접수 당시 질문 · 동의 문구</summary>
                {g.question_snapshot.map((q: ClubRow) => (
                  <p key={q.id}>
                    <strong>
                      {q.label} · v{q.version}
                    </strong>
                    {q.help_text && (
                      <>
                        <br />
                        {q.help_text}
                      </>
                    )}
                    <br />
                    {String(
                      q.field_key
                        ? (g.answers[q.field_key] ?? "—")
                        : g.answers.extra_answers?.[q.key] || "—",
                    )}
                  </p>
                ))}
              </details>
            )}
            <details>
              <summary>전체 원본 응답 · 운영진 전용</summary>
              <pre>{JSON.stringify(g.answers, null, 2)}</pre>
            </details>
            <p className="micro">개인정보를 외부에 공유하지 마세요.</p>
          </div>
        </Modal>
      )}
    </>
  );
}

export function AdminMembers() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<ClubRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const { mutate, toast } = useApp();
  const query = `status=${status}&q=${encodeURIComponent(q)}`;
  const resource = useResource(`admin/members?${query}&page=${page}`);
  const applications = useResource("admin/applications");
  return (
    <>
      <PageTitle
        eyebrow="OUR TEAM"
        title="회원"
        action={
          <button
            className="icon-button bordered"
            aria-label="회원 내보내기"
            onClick={() => setExporting(true)}
          >
            <Download size={20} />
          </button>
        }
      />
      <Resource resource={applications}>
        {(rows) =>
          rows.length ? (
            <>
              <SectionTitle title="가입 신청 확인" />
              {rows.map((a: ClubRow) => (
                <div className="card" key={a.id}>
                  <div className="detail-line">
                    <strong>{a.name}</strong>
                    <Badge tone="gold">
                      {a.status === "hold"
                        ? "보류"
                        : a.status === "rejected"
                          ? "거절"
                          : "승인 대기"}
                    </Badge>
                  </div>
                  <p>
                    {a.phone} · {a.answers.position} · {a.answers.experience}
                  </p>
                  <details className="prose">
                    <summary>신청 답변 보기</summary>
                    <pre>{JSON.stringify(a.answers, null, 2)}</pre>
                  </details>
                  <ReviewApplication application={a} />
                </div>
              ))}
            </>
          ) : null
        }
      </Resource>
      <NameRequestReviews />
      <label className="search-box">
        <Search size={19} />
        <input
          aria-label="회원 검색"
          placeholder="회원 이름 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <Chips
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(0);
        }}
        items={[
          { value: "all", label: "전체" },
          { value: "active", label: "활성" },
          { value: "inactive", label: "휴면" },
          { value: "withdrawn", label: "탈퇴" },
        ]}
      />
      <Resource resource={resource}>
        {(d) => (
          <>
            {d.rows.map((m: ClubRow) => (
              <button
                className="list-card full"
                key={m.id}
                onClick={() => setEdit(m)}
              >
                <Avatar member={m} />
                <div>
                  <strong>{m.name}</strong>
                  <small>
                    {m.position || "미정"} ·{" "}
                    {m.admins?.titles?.join(" · ") || "회원"}
                  </small>
                </div>
                <Badge tone={m.status === "active" ? "green" : ""}>
                  {m.status === "active"
                    ? "활성"
                    : m.status === "withdrawn"
                      ? "탈퇴"
                      : "휴면"}
                </Badge>
                <ChevronRight size={16} />
              </button>
            ))}
            {!d.rows.length && (
              <Empty icon={Users} title="등록된 회원이 없어요" />
            )}
            <Pagination page={page} total={d.total} setPage={setPage} />
          </>
        )}
      </Resource>
      {edit && (
        <Modal title="회원 상세 · 수정" close={() => setEdit(null)}>
          <MemberEditor member={edit} close={() => setEdit(null)} />
        </Modal>
      )}
      {exporting && (
        <ExportSheet
          resource="members"
          query={query}
          close={() => setExporting(false)}
        />
      )}
    </>
  );
}

export function ReviewApplication({
  application: a,
}: {
  application: ClubRow;
}) {
  const { mutate, toast } = useApp();
  const [memberId, setMemberId] = useState("");
  const [note, setNote] = useState(a.review_note || "");
  const [busy, setBusy] = useState(false);
  if (a.external_id && !a.user_id)
    return (
      <p className="micro">
        과거 신청 자료 · 계정 미연결. 실제 SpotLight 계정의 가입 신청을 받은 뒤
        기존 회원 ID로 연결해주세요.
      </p>
    );
  return (
    <>
      <label className="field">
        <span>기존 회원 연결 ID (기존 회원인 경우)</span>
        <input
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          placeholder="검증한 member_id · 전화번호 일치 필요"
        />
      </label>
      <Field
        label="검토 안내 · 신청자에게 표시"
        name="review_note"
        type="textarea"
        value={note}
        maxLength={1000}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          setNote(e.target.value)
        }
      />
      <div className="button-row">
        {[
          { status: "approved", label: "승인" },
          { status: "hold", label: "보류" },
          { status: "rejected", label: "거절" },
        ].map((i) => (
          <button
            key={i.status}
            className={`button ${i.status === "approved" ? "primary" : "secondary"}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await mutate("admin/applications/review", {
                  id: a.id,
                  status: i.status,
                  member_id: memberId || null,
                  note,
                });
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {i.label}
          </button>
        ))}
      </div>
    </>
  );
}

function NameRequestReviews() {
  const resource = useResource("admin/name-requests");
  return (
    <Resource resource={resource}>
      {(rows) =>
        rows.length ? (
          <>
            <SectionTitle title="이름 변경 검토" />
            {rows.map((r: ClubRow) => (
              <NameRequestReview key={r.id} request={r} />
            ))}
          </>
        ) : null
      }
    </Resource>
  );
}
function NameRequestReview({ request: r }: { request: ClubRow }) {
  const { mutate, toast } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <h3>
        {r.previous_name} → {r.requested_name}
      </h3>
      <p>{r.reason || "사유 미입력"}</p>
      <p className="micro">
        {formatDate(r.submitted_at)} {formatTime(r.submitted_at)} 신청
      </p>
      <Field
        label="이름 변경 검토 안내"
        name="name_review_note"
        value={note}
        maxLength={1000}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setNote(e.target.value)
        }
      />
      <div className="button-row">
        {["approved", "rejected"].map((status) => (
          <button
            key={status}
            disabled={busy}
            className={`button ${status === "approved" ? "primary" : "secondary"}`}
            onClick={async () => {
              setBusy(true);
              try {
                await mutate("admin/name-requests/review", {
                  id: r.id,
                  status,
                  note,
                });
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {status === "approved" ? "이름 변경 승인" : "이름 변경 거절"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MemberEditor({
  member: m,
  close,
}: {
  member: ClubRow;
  close: () => void;
}) {
  const { mutate, toast } = useApp();
  const detail = useResource(`admin/member/${m.id}`);
  const [titles, setTitles] = useState(m.admins?.titles?.join(", ") || "");
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <div className="profile-card">
        <Avatar member={detail.data || m} size="large" />
        <div>
          <strong>{m.name}</strong>
          <p>{m.joined_on} 가입</p>
          <small>ID: {m.id}</small>
        </div>
      </div>
      <Resource resource={detail}>
        {(d) => (
          <Stats
            items={[
              {
                label: "올해 출석",
                value: (d.year_attendance || 0) + "회",
              },
              {
                label: "전체 실제 출석",
                value: (d.attendance_count || 0) + "회",
              },
              {
                label: "이번 달 회비",
                value: d.current_month_payment
                  ? paymentLabel(d.current_month_payment.status)
                  : "미등록",
                tone:
                  d.current_month_payment?.status === "unpaid"
                    ? "red"
                    : "green",
              },
              {
                label: "최근 참석",
                value: d.last_attended
                  ? formatDate(d.last_attended, {
                      month: "numeric",
                      day: "numeric",
                    })
                  : "—",
              },
            ]}
          />
        )}
      </Resource>
      <label className="button secondary full">
        {uploading ? "사진 업로드 중…" : "회원 프로필 사진 변경"}
        <input
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              if (file.size > 5242880)
                throw new Error("5MB 이하의 사진을 선택해주세요.");
              const content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              await mutate("admin/avatar", {
                member_id: m.id,
                content,
                type: file.type,
              });
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      {detail.data?.avatar_path && (
        <button
          className="text-button danger-text"
          onClick={async () => {
            try {
              await mutate("admin/avatar", { member_id: m.id }, "DELETE");
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          회원 프로필 사진 삭제
        </button>
      )}
      <SaveForm
        onSubmit={async (f) => {
          await mutate(
            "admin/members",
            {
              id: m.id,
              name: f.get("name"),
              phone: f.get("phone"),
              birth_date: f.get("birth_date") || null,
              position: f.get("position"),
              experience: f.get("experience"),
              status: f.get("status"),
              admin_memo: f.get("admin_memo"),
            },
            "PATCH",
          );
          close();
        }}
      >
        <Field label="이름" name="name" value={m.name} required />
        <Field
          label="생년월일"
          name="birth_date"
          type="date"
          value={m.birth_date}
        />
        <Field
          label="연락처"
          name="phone"
          type="tel"
          value={m.phone}
          required
        />
        <Field label="포지션" name="position" value={m.position} />
        <Field label="배구 경력" name="experience" value={m.experience} />
        <Field label="회원 상태" name="status" value={m.status}>
          {["active", "inactive", "withdrawn"].map((s) => (
            <option key={s} value={s}>
              {s === "active" ? "활성" : s === "inactive" ? "휴면" : "탈퇴"}
            </option>
          ))}
        </Field>
        <Field
          label="운영진 메모 · 회원 비공개"
          name="admin_memo"
          type="textarea"
          value={m.member_notes?.admin_memo || ""}
        />
      </SaveForm>
      <SectionTitle title="운영진 권한" />
      <label className="field">
        <span>직책 · 역할 (쉼표로 구분, 비우면 해제)</span>
        <input
          value={titles}
          onChange={(e) => setTitles(e.target.value)}
          placeholder="총무, 게스트 담당"
        />
      </label>
      <button
        className="button secondary full"
        onClick={async () => {
          if (!window.confirm("관리자 권한을 변경하시겠습니까?")) return;
          try {
            await mutate("admin/roles", {
              member_id: m.id,
              titles: titles
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean),
            });
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      >
        <ShieldCheck size={18} />
        운영진 권한 변경
      </button>
      <Menu
        items={[
          {
            href: `/admin/dues?member=${m.id}`,
            label: "회비 관리",
            icon: Wallet,
          },
          {
            href: `/admin/attendance?view=records&member=${m.id}`,
            label: "출석 관리",
            icon: Activity,
          },
          { href: "/admin/uniforms", label: "유니폼 관리", icon: Shirt },
        ]}
      />
    </>
  );
}

export function AdminMore() {
  return (
    <>
      <PageTitle eyebrow="OPERATIONS" title="더보기" />
      <div className="card">
        <h2>화면 미리보기</h2>
        <div className="button-row">
          <Link className="button secondary" href="/preview?role=guest">
            비회원 화면
          </Link>
          <Link className="button secondary" href="/preview?role=member">
            회원 화면
          </Link>
        </div>
        <small>가상 데이터로 확인할 수 있습니다.</small>
      </div>
      <Menu
        items={[
          { href: "/admin/attendance", label: "출석 관리", icon: CheckCircle2 },
          { href: "/admin/dues", label: "회비 관리", icon: Wallet },
          {
            href: "/admin/notices",
            label: "공지 · 긴급공지",
            icon: ClipboardList,
          },
          { href: "/admin/videos", label: "영상 관리", icon: Play },
          {
            href: "/admin/roster",
            label: "당일 참가자 명단 · 공유",
            icon: Share2,
          },
          { href: "/admin/analytics", label: "운영 대시보드", icon: Activity },
          { href: "/admin/import", label: "기존 데이터 Import", icon: FileUp },
          {
            href: "/admin/export",
            label: "Excel · CSV Export",
            icon: Download,
          },
          { href: "/rules", label: "회칙 · 버전 관리", icon: BookOpen },
          { href: "/admin/uniforms", label: "유니폼 관리", icon: Shirt },
          {
            href: "/admin/settings",
            label: "신청 질문 · 운영 설정",
            icon: Settings,
          },
          { href: "/profile", label: "내 프로필", icon: UserRound },
        ]}
      />
    </>
  );
}

export function AdminAttendance() {
  const { boot, mutate, toast } = useApp();
  const params = useSearchParams();
  const [mode, setMode] = useState(
    params.get("view") === "records" ? "records" : "check",
  );
  const [memberId, setMemberId] = useState(params.get("member") || "");
  const [response, setResponse] = useState(params.get("response") || "all");
  const [page, setPage] = useState(0);
  const past = boot.events
    .filter(
      (e: ClubEvent) =>
        new Date(e.ends_at) < new Date() &&
        !["deleted", "cancelled"].includes(e.status) &&
        e.kind !== "holiday",
    )
    .sort((a: ClubEvent, b: ClubEvent) =>
      b.starts_at.localeCompare(a.starts_at),
    );
  const [event, setEvent] = useState(params.get("event") || past[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [exporting, setExporting] = useState(false);
  const resource = useResource(
    event && mode === "check"
      ? `admin/attendance?event=${event}&response=${response}&page=${page}`
      : null,
  );
  return (
    <>
      <PageTitle
        eyebrow="ATTENDANCE"
        title="실제 출석 체크"
        description="운동 종료 후 실제 참여한 회원을 체크해주세요."
        action={
          mode === "check" && (
            <button
              className="icon-button bordered"
              aria-label="출석 내보내기"
              onClick={() => setExporting(true)}
            >
              <Download size={20} />
            </button>
          )
        }
      />
      <Chips
        value={mode}
        onChange={setMode}
        items={[
          { value: "check", label: "운동별 출석 확정" },
          { value: "records", label: "회원별 출석 기록" },
        ]}
      />
      {mode === "records" ? (
        <>
          <MemberPicker value={memberId} onSelect={setMemberId} />
          <AttendanceHistory key={memberId} admin memberId={memberId} />
        </>
      ) : (
        <>
          <Field
            label="운동 선택"
            name="event"
            value={event}
            onChange={(e: any) => {
              setEvent(e.target.value);
              setPage(0);
            }}
          >
            <option value="">일정을 선택해주세요</option>
            {boot.events
              .filter(
                (e: ClubEvent) =>
                  !["deleted", "cancelled"].includes(e.status) &&
                  e.kind !== "holiday",
              )
              .map((e: ClubEvent) => (
                <option value={e.id} key={e.id}>
                  {formatDate(e.starts_at)} · {e.title}
                </option>
              ))}
          </Field>
          <Chips
            value={response}
            onChange={(v) => {
              setResponse(v);
              setPage(0);
            }}
            items={[
              { value: "all", label: "전체 응답" },
              { value: "yes", label: "참석 응답" },
              { value: "no", label: "불참 응답" },
              { value: "unanswered", label: "미응답" },
            ]}
          />
          <Resource resource={resource}>
            {(d) => {
              const ended =
                d.event &&
                new Date(d.event.ends_at) <= new Date() &&
                ["scheduled", "completed"].includes(d.event.status) &&
                d.event.kind !== "holiday";
              const visible = d.members.filter(
                (m: ClubRow) =>
                  response === "all" ||
                  (d.attendance.find((a: ClubRow) => a.member_id === m.id)
                    ?.response || "unanswered") === response,
              );
              return (
                <>
                  {!ended && (
                    <p className="setup-banner">
                      현재는 사전 응답만 확인할 수 있습니다. 운동 종료 후 실제
                      출석을 확정해주세요.
                    </p>
                  )}
                  <div className="detail-line">
                    <p>체크 완료 {d.summary.present}명</p>
                    <small>
                      전체 {d.summary.members}명 · 필터 결과 {d.total}명
                    </small>
                  </div>
                  {visible.map((m: ClubRow) => {
                    const a = d.attendance.find(
                      (a: ClubRow) => a.member_id === m.id,
                    );
                    return (
                      <div className="list-card" key={m.id}>
                        <Avatar member={m} />
                        <div>
                          <strong>{m.name}</strong>
                          <small>
                            {m.position} ·{" "}
                            {a?.response === "yes"
                              ? "참석 예정"
                              : a?.response === "no"
                                ? "불참 예정"
                                : "미응답"}
                          </small>
                        </div>
                        <div className="button-row">
                          <button
                            disabled={busy === m.id || !ended}
                            aria-pressed={a?.actual === true}
                            className={`button compact ${a?.actual ? "success" : "secondary"}`}
                            onClick={async () => {
                              setBusy(m.id);
                              try {
                                await mutate("admin/attendance", {
                                  event_id: event,
                                  member_id: m.id,
                                  actual: true,
                                });
                              } catch (e) {
                                toast((e as Error).message);
                              } finally {
                                setBusy("");
                              }
                            }}
                          >
                            {a?.actual ? (
                              <>
                                <Check size={16} />
                                출석
                              </>
                            ) : (
                              "출석 확인"
                            )}
                          </button>
                          <button
                            className={`button compact ${a?.actual === false ? "primary" : "secondary"}`}
                            disabled={busy === m.id || !ended}
                            aria-pressed={a?.actual === false}
                            onClick={async () => {
                              setBusy(m.id);
                              try {
                                await mutate("admin/attendance", {
                                  event_id: event,
                                  member_id: m.id,
                                  actual: false,
                                });
                              } catch (e) {
                                toast((e as Error).message);
                              } finally {
                                setBusy("");
                              }
                            }}
                          >
                            불참 확인
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!visible.length && (
                    <Empty title="이 응답에 해당하는 회원이 없어요" />
                  )}
                  <Pagination page={page} total={d.total} setPage={setPage} />
                </>
              );
            }}
          </Resource>
          {!event && <Empty title="출석을 체크할 일정을 선택해주세요" />}
        </>
      )}
      {exporting && (
        <ExportSheet
          resource="attendance"
          query={`event=${event}&response=${response}`}
          close={() => setExporting(false)}
        />
      )}
    </>
  );
}

export function AdminDues() {
  const { mutate } = useApp();
  const params = useSearchParams();
  const [month, setMonth] = useState(
    params.get("month") || seoulDate().slice(0, 7),
  );
  const [member, setMember] = useState(params.get("member") || "");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [edit, setEdit] = useState<ClubRow | boolean>(false);
  const [exporting, setExporting] = useState(false);
  const resource = useResource(
    `admin/dues?month=${month}&status=${status}&member=${member}`,
  );
  const summary = useResource(
    `admin/dues-summary?month=${month}&member=${member}`,
  );
  const query = `month=${month}&status=${status}&member=${member}`;
  return (
    <>
      <PageTitle
        eyebrow="MEMBERSHIP"
        title="회비 관리"
        action={
          <div className="button-row">
            <button
              className="icon-button bordered"
              aria-label="회비 내보내기"
              onClick={() => setExporting(true)}
            >
              <Download size={19} />
            </button>
            <button
              className="icon-button bordered"
              aria-label="회비 등록"
              onClick={() => setEdit(true)}
            >
              <Plus />
            </button>
          </div>
        }
      />
      <button
        className="button secondary full"
        onClick={() => {
          setMonth(seoulDate().slice(0, 7));
          setStatus("unpaid");
          setMember("");
        }}
      >
        이번 달 미납자 보기
      </button>
      {member && (
        <button className="text-button" onClick={() => setMember("")}>
          회원 필터 해제 · 전체 회원 보기
        </button>
      )}
      <input
        className="month-input"
        type="month"
        aria-label="회비 월"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <Chips
        value={status}
        onChange={setStatus}
        items={[
          { value: "all", label: "전체" },
          { value: "paid", label: "납부완료" },
          { value: "unpaid", label: "미납" },
          { value: "exempt", label: "면제" },
        ]}
      />
      <Resource resource={summary}>
        {(d) => (
          <>
            <Stats
              items={[
                { label: "납부완료", value: d.paid, tone: "green" },
                { label: "미납", value: d.unpaid, tone: "red" },
                { label: "면제", value: d.exempt },
              ]}
            />
            <p className="micro">
              선택 월의 등록된 회비 기준입니다. 회비 미등록 {d.unregistered}명은
              미납으로 추정하지 않습니다.
            </p>
          </>
        )}
      </Resource>
      <Resource resource={resource}>
        {(rows) =>
          rows.length ? (
            rows.map((p: ClubRow) => (
              <button
                className="list-card full"
                key={p.id}
                onClick={() => setEdit(p)}
              >
                <Avatar member={p.members || { name: "회원" }} />
                <div>
                  <strong>{p.members?.name}</strong>
                  <small>{p.amount.toLocaleString()}원</small>
                </div>
                <Badge
                  tone={
                    p.status === "paid"
                      ? "green"
                      : p.status === "unpaid"
                        ? "red"
                        : ""
                  }
                >
                  {paymentLabel(p.status)}
                </Badge>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty icon={Wallet} title="등록된 회비가 없어요">
              상단 + 버튼으로 회원별 월 회비를 등록해주세요.
            </Empty>
          )
        }
      </Resource>
      {edit && (
        <Modal title="회원 회비 등록 · 수정" close={() => setEdit(false)}>
          <SaveForm
            onSubmit={async (f) => {
              await mutate("admin/dues", {
                member_id: f.get("member_id"),
                month: `${f.get("month")}-01`,
                amount: Number(f.get("amount")),
                status: f.get("status"),
              });
              setEdit(false);
            }}
          >
            <MemberPicker
              value={typeof edit === "object" ? edit.member_id : member}
            />
            <Field
              label="월"
              name="month"
              type="month"
              value={typeof edit === "object" ? edit.month.slice(0, 7) : month}
              required
            />
            <Field
              label="금액"
              name="amount"
              type="number"
              value={typeof edit === "object" ? edit.amount : 60000}
              min={0}
              required
            />
            <Field
              label="납부 상태"
              name="status"
              value={typeof edit === "object" ? edit.status : "unpaid"}
            >
              {["paid", "unpaid", "exempt"].map((s) => (
                <option value={s} key={s}>
                  {paymentLabel(s)}
                </option>
              ))}
            </Field>
          </SaveForm>
        </Modal>
      )}
      {exporting && (
        <ExportSheet
          resource="dues"
          query={query}
          close={() => setExporting(false)}
        />
      )}
    </>
  );
}

export function MemberPicker({
  value = "",
  onSelect,
}: {
  value?: string;
  onSelect?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(value);
  const resource = useResource(
    `admin/members?status=all&q=${encodeURIComponent(q)}&page=${page}`,
  );
  return (
    <div className="field">
      <span>회원 선택 *</span>
      <input
        placeholder="회원 검색"
        aria-label="회원 선택 검색"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
      />
      <input type="hidden" name="member_id" value={selected} />
      <Resource resource={resource}>
        {(d) => (
          <>
            <select
              required
              aria-label="선택할 회원"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                onSelect?.(e.target.value);
              }}
            >
              <option value="">회원 선택</option>
              {selected && !d.rows.some((m: ClubRow) => m.id === selected) && (
                <option value={selected}>
                  선택된 회원 · {selected.slice(0, 8)}
                </option>
              )}
              {d.rows.map((m: ClubRow) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.phone}
                </option>
              ))}
            </select>
            <Pagination page={page} total={d.total} setPage={setPage} />
          </>
        )}
      </Resource>
    </div>
  );
}

export function AdminNotices() {
  const resource = useResource("admin/notices");
  const [edit, setEdit] = useState<ClubRow | boolean>(false);
  return (
    <>
      <PageTitle
        title="공지 · 긴급공지"
        action={
          <button
            className="icon-button bordered"
            aria-label="공지 등록"
            onClick={() => setEdit(true)}
          >
            <Plus />
          </button>
        }
      />
      <Resource resource={resource}>
        {(rows) =>
          rows.length ? (
            rows.map((n: ClubRow) => (
              <div key={n.id}>
                <NoticeCard notice={n} />
                <button className="text-button" onClick={() => setEdit(n)}>
                  수정
                </button>
              </div>
            ))
          ) : (
            <Empty icon={ClipboardList} title="첫 공지를 등록해주세요" />
          )
        }
      </Resource>
      {edit && (
        <NoticeEditor
          notice={typeof edit === "object" ? edit : undefined}
          close={() => setEdit(false)}
        />
      )}
    </>
  );
}

export function AdminUniforms() {
  const resource = useResource("admin/uniforms");
  const [edit, setEdit] = useState<ClubRow | boolean>(false);
  const { mutate } = useApp();
  return (
    <>
      <PageTitle
        title="유니폼 관리"
        action={
          <button
            className="icon-button bordered"
            aria-label="유니폼 등록"
            onClick={() => setEdit(true)}
          >
            <Plus />
          </button>
        }
      />
      <Resource resource={resource}>
        {(rows) =>
          rows.length ? (
            rows.map((u: ClubRow) => (
              <button
                className="list-card full"
                key={u.member_id}
                onClick={() => setEdit(u)}
              >
                <span className="list-icon">
                  <Shirt size={24} />
                </span>
                <div>
                  <strong>
                    {u.members?.name} · #{u.number}
                  </strong>
                  <small>
                    {u.nickname} · 상의 {u.top_size} / 하의 {u.bottom_size}
                  </small>
                </div>
                <ChevronRight size={17} />
              </button>
            ))
          ) : (
            <Empty icon={Shirt} title="유니폼 정보를 등록해주세요" />
          )
        }
      </Resource>
      {edit && (
        <Modal title="유니폼 등록 · 수정" close={() => setEdit(false)}>
          <SaveForm
            onSubmit={async (f) => {
              await mutate("admin/uniforms", Object.fromEntries(f));
              setEdit(false);
            }}
          >
            <MemberPicker
              value={typeof edit === "object" ? edit.member_id : ""}
            />
            {[
              { name: "nickname", label: "닉네임" },
              { name: "number", label: "등번호" },
              { name: "top_size", label: "상의 사이즈" },
              { name: "bottom_size", label: "하의 사이즈" },
            ].map((i) => (
              <Field
                key={i.name}
                {...i}
                value={typeof edit === "object" ? edit[i.name] : ""}
              />
            ))}
          </SaveForm>
        </Modal>
      )}
    </>
  );
}

export function SettingsScreen() {
  const { mutate, boot } = useApp();
  const resource = useResource("admin/questions");
  const [edit, setEdit] = useState<ClubRow | boolean>(false);
  return (
    <>
      <PageTitle title="신청 질문 · 운영 설정" />
      <div className="card">
        <h2>서비스 연결 상태</h2>
        <div className="detail-line">
          <span>데이터베이스</span>
          <Badge tone={boot.configured ? "green" : "gold"}>
            {boot.configured ? "연결됨" : "미설정"}
          </Badge>
        </div>
        <div className="detail-line">
          <span>실제 신청 접수</span>
          <Badge tone={boot.acceptingApplications ? "green" : "gold"}>
            {boot.acceptingApplications ? "설정됨" : "개인정보 안내 설정 필요"}
          </Badge>
        </div>
        <p className="micro">
          계좌·개인정보 보관 기간·담당자·Push 키는 서버 환경변수로 설정합니다.
          비밀 키를 이 화면에 입력하지 마세요.
        </p>
      </div>
      <SectionTitle title="신청 질문" />
      <p className="micro">
        기본 항목은 질문 문구와 도움말을 수정할 수 있습니다. 추가 질문은
        등록·수정·삭제할 수 있으며, 기존 신청의 질문·답변은 보존됩니다.
      </p>
      <button className="button secondary full" onClick={() => setEdit(true)}>
        <Plus size={17} />
        추가 질문 등록
      </button>
      <Resource resource={resource}>
        {(rows) =>
          rows.length ? (
            rows.map((q: ClubRow) => (
              <button
                className="list-card full"
                key={q.id}
                onClick={() => setEdit(q)}
              >
                <div>
                  <strong>{q.label}</strong>
                  <small>
                    {q.form === "guest" ? "게스트" : "회원"} ·{" "}
                    {q.is_system ? "기본" : "추가"} · v{q.version || 1} ·{" "}
                    {q.required ? "필수" : "선택"} ·{" "}
                    {q.active ? "사용 중" : "숨김"}
                  </small>
                </div>
                <ChevronRight size={17} />
              </button>
            ))
          ) : (
            <Empty icon={ClipboardList} title="추가 질문이 없어요">
              기본 신청서 항목 외 질문을 등록할 수 있습니다.
            </Empty>
          )
        }
      </Resource>
      {edit && (
        <Modal title="질문 등록 · 수정" close={() => setEdit(false)}>
          <SaveForm
            onSubmit={async (f) => {
              await mutate(
                typeof edit === "object"
                  ? `admin/questions/${edit.id}`
                  : "admin/questions",
                {
                  form: typeof edit === "object" ? edit.form : f.get("form"),
                  key: f.get("key"),
                  label: f.get("label"),
                  help_text: f.get("help_text"),
                  type:
                    typeof edit === "object" && edit.is_system
                      ? edit.type
                      : f.get("type"),
                  options: String(f.get("options"))
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  required:
                    typeof edit === "object" && edit.is_system
                      ? edit.required
                      : f.has("required"),
                  active:
                    typeof edit === "object" && edit.is_system
                      ? edit.active
                      : f.has("active"),
                  sort_order: Number(f.get("sort_order")),
                },
                typeof edit === "object" ? "PATCH" : "POST",
              );
              setEdit(false);
            }}
          >
            <Field
              label="신청서"
              name="form"
              value={typeof edit === "object" ? edit.form : "guest"}
              disabled={typeof edit === "object"}
            >
              <option value="guest">게스트</option>
              <option value="member">회원</option>
            </Field>
            <Field
              label="질문 고유키 · 영문 소문자/숫자/_"
              name="key"
              required
              value={typeof edit === "object" ? edit.key : ""}
              pattern="[a-z][a-z0-9_]{1,60}"
              readOnly={typeof edit === "object"}
            />
            <Field
              label="질문"
              name="label"
              required
              value={typeof edit === "object" ? edit.label : ""}
            />
            <Field
              label="도움말"
              name="help_text"
              type="textarea"
              value={typeof edit === "object" ? edit.help_text || "" : ""}
              maxLength={2000}
            />
            <Field
              label="답변 형식"
              name="type"
              value={typeof edit === "object" ? edit.type : "text"}
              disabled={typeof edit === "object" && edit.is_system}
            >
              <option value="text">짧은 글</option>
              <option value="textarea">긴 글</option>
              <option value="select">선택형</option>
            </Field>
            <Field
              label="선택지 · 한 줄에 하나"
              name="options"
              type="textarea"
              value={typeof edit === "object" ? edit.options.join("\n") : ""}
              readOnly={typeof edit === "object" && edit.is_system}
            />
            <Field
              label="순서"
              name="sort_order"
              type="number"
              min={0}
              max={100}
              value={typeof edit === "object" ? edit.sort_order : 0}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                name="required"
                disabled={typeof edit === "object" && edit.is_system}
                defaultChecked={
                  typeof edit === "object" ? edit.required : false
                }
              />
              <span>필수 질문</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="active"
                disabled={typeof edit === "object" && edit.is_system}
                defaultChecked={typeof edit === "object" ? edit.active : true}
              />
              <span>사용 중</span>
            </label>
          </SaveForm>
          {typeof edit === "object" && !edit.is_system && (
            <button
              className="button danger full"
              onClick={async () => {
                if (
                  !window.confirm(
                    "이 질문을 신청서에서 삭제할까요? 기존 신청 답변은 보존됩니다.",
                  )
                )
                  return;
                try {
                  await mutate(`admin/questions/${edit.id}`, {}, "DELETE");
                  setEdit(false);
                } catch (e) {
                  alert((e as Error).message);
                }
              }}
            >
              추가 질문 삭제
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
