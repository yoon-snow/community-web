"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MapPin,
  Play,
  Plus,
  Users,
  Volleyball,
  X,
  AlertCircle,
  Clock,
  BookOpen,
} from "lucide-react";
import {
  monthBounds,
  eventKinds,
  sortAnnouncements,
  canApplyAsGuest,
  guestAvailability,
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
  SectionTitle,
  Modal,
  Chips,
  Stats,
  PageTitle,
  Back,
  paymentLabel,
  Pagination,
} from "./core";
import { VideoCard } from "./video-card";
import dynamic from "next/dynamic";
import { Loader } from "./core";
const ScheduleTools = dynamic(
  () => import("./schedule-tools").then((m) => m.ScheduleTools),
  { loading: Loader },
);
const EventEditor = dynamic(
  () => import("./admin-forms").then((m) => m.EventEditor),
  { loading: Loader },
);
const RuleForm = dynamic(
  () => import("./admin-forms").then((m) => m.RuleForm),
  { loading: Loader },
);

export function HomeScreen() {
  const { boot, link } = useApp();
  const next = boot.events.find(
    (e: ClubEvent) =>
      new Date(e.starts_at) > new Date() &&
      e.status === "scheduled" &&
      e.kind !== "holiday",
  );
  const me = useResource(boot.member ? "me" : null);
  return (
    <>
      <Emergency />
      <div className="greeting">
        <p>
          {boot.member ? "다시 만나 반가워요" : "PLAY TOGETHER, SHINE TOGETHER"}
        </p>
        <h1>
          {boot.member ? (
            <>
              {boot.member.name}님,
              <br />
              오늘도 코트에서 빛나요<span className="gold">.</span>
            </>
          ) : (
            <>
              우리의 배구가
              <br />더 빛나는 곳<span className="gold">.</span>
            </>
          )}
        </h1>
        <span className="greeting-caption">
          함께 뛰고, 함께 성장하는 SpotLight
        </span>
      </div>
      {next ? (
        <>
          <SectionTitle title="다음 운동" href="/calendar" label="일정 보기" />
          <EventCard event={next} featured />
          {boot.member && <EventActions event={next} />}
        </>
      ) : (
        <div className="card">
          <Empty icon={CalendarDays} title="다음 운동을 준비 중이에요">
            일정이 등록되면 여기에서 확인할 수 있어요.
          </Empty>
        </div>
      )}
      {boot.member ? (
        <>
          <SectionTitle title="내 활동" href="/attendance" />
          <Resource resource={me}>
            {(d) => {
              const summary = d.summary;
              const pay = summary.current_month_payment;
              return (
                <Stats
                  items={[
                    {
                      label: "올해 출석",
                      value: (
                        <>
                          {summary.year_attendance}
                          <small>회</small>
                        </>
                      ),
                    },
                    {
                      label: "이번 달 출석",
                      value: (
                        <>
                          {summary.month_attendance}
                          <small>회</small>
                        </>
                      ),
                    },
                    {
                      label: "최근 참석",
                      value: summary.last_attended_at
                        ? formatDate(summary.last_attended_at, {
                            month: "numeric",
                            day: "numeric",
                          })
                        : "—",
                    },
                    {
                      label: "이번 달 회비",
                      value: pay ? paymentLabel(pay.status) : "미등록",
                      tone: pay?.status === "paid" ? "green" : "",
                    },
                  ]}
                />
              );
            }}
          </Resource>
        </>
      ) : (
        <Link
          href={link(next ? `/events/${next.id}` : "/calendar")}
          className="guest-cta"
        >
          <span className="circle-icon">
            <Users />
          </span>
          <span>
            <strong>SpotLight와 함께 뛰어볼까요?</strong>
            <small>회원가입 없이 게스트 신청하기</small>
          </span>
          <ArrowRight size={19} />
        </Link>
      )}
      <SectionTitle title="클럽 소식" href="/notices" />
      {boot.announcements.length ? (
        sortAnnouncements(boot.announcements as ClubRow[])
          .slice(0, 3)
          .map((n: ClubRow) => <NoticeCard key={n.id} notice={n} />)
      ) : (
        <Empty icon={ClipboardList} title="새로운 소식을 준비 중이에요" />
      )}
      <div className="club-wordmark">
        <Volleyball size={18} />
        <span>ONE TEAM. ONE SPOTLIGHT.</span>
      </div>
    </>
  );
}

export function Emergency() {
  const { boot, link } = useApp();
  const urgent = sortAnnouncements(boot.announcements as ClubRow[]).filter(
    (n) => n.kind === "emergency",
  );
  const n = urgent[0];
  return n ? (
    <Link href={link("/notices")} className="emergency">
      <AlertCircle size={20} />
      <div>
        <small>
          긴급공지{urgent.length > 1 ? ` · ${urgent.length}건` : ""}
        </small>
        <strong>{n.title}</strong>
        <p className="urgent-excerpt">{n.content}</p>
      </div>
      <ChevronRight size={18} />
    </Link>
  ) : null;
}

export function EventCard({
  event,
  featured = false,
}: {
  event: ClubEvent;
  featured?: boolean;
}) {
  const { link, screen, boot } = useApp();
  const kind = boot.scheduleKinds?.find((k: ClubRow) => k.key === event.kind);
  return (
    <Link
      href={link(
        `${screen.startsWith("/admin") ? "/admin" : ""}/events/${event.id}`,
      )}
      className={`event-card ${featured ? "featured" : ""} ${event.is_emergency || event.status === "cancelled" ? "urgent-event" : ""}`}
    >
      <div className="event-top">
        <div className="event-badges">
          <span
            className={"badge " + event.kind}
            style={{
              borderLeft: "4px solid " + (kind?.color || "var(--navy)"),
            }}
          >
            {kind?.label || eventKinds[event.kind] || event.kind}
          </span>
          {(event.is_emergency || event.status === "cancelled") && (
            <Badge tone="red">
              {event.status === "cancelled" ? "운동 취소" : "긴급 변경"}
            </Badge>
          )}
        </div>
        <span>
          {event.status === "cancelled"
            ? "취소"
            : event.status === "completed"
              ? "종료"
              : "정기 운동"}
          <ChevronRight size={16} />
        </span>
      </div>
      <h3>{formatDate(event.starts_at)}</h3>
      <p className="event-name">{event.title}</p>
      <div className="event-meta">
        <span>
          <Clock size={16} />
          {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
        </span>
        <span>
          <MapPin size={16} />
          {event.location}
        </span>
      </div>
      {featured && (
        <div className="court-art" aria-hidden="true">
          <div />
          <Volleyball size={35} strokeWidth={1} />
        </div>
      )}
    </Link>
  );
}

export function EventActions({ event }: { event: ClubEvent }) {
  const { mutate, toast } = useApp();
  const resource = useResource(`events/${event.id}`);
  const [busy, setBusy] = useState(false);
  const respond = async (response: string) => {
    setBusy(true);
    try {
      await mutate("rsvp", { event_id: event.id, response });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Resource resource={resource}>
      {(d) => (
        <div className="participation">
          <p className="detail-line">
            <span>내 참석 응답</span>
            <Badge tone={d.response === "yes" ? "green" : "neutral"}>
              {d.response === "yes"
                ? "참석"
                : d.response === "no"
                  ? "불참"
                  : "미응답"}
            </Badge>
          </p>
          <div className="count-row">
            <span>
              회원 참석 예정 <b>{d.counts?.members || 0}</b>
            </span>
            <span>
              게스트 예정 <b>{d.counts?.guests || 0}</b>
            </span>
            <span>
              예상 참가 인원 <b>{d.counts?.total || 0}</b>
            </span>
          </div>
          {new Date(event.starts_at) > new Date() &&
            event.status === "scheduled" &&
            event.kind !== "holiday" && (
              <div className="button-row">
                <button
                  className={`button ${d.response === "yes" ? "primary" : "secondary"}`}
                  disabled={busy}
                  onClick={() => respond("yes")}
                  aria-pressed={d.response === "yes"}
                >
                  <Check size={18} />
                  참석{d.response === "yes" ? " 중" : ""}
                </button>
                <button
                  className={`button ${d.response === "no" ? "primary" : "secondary"}`}
                  disabled={busy}
                  onClick={() => respond("no")}
                  aria-pressed={d.response === "no"}
                >
                  <X size={18} />
                  불참{d.response === "no" ? " 중" : ""}
                </button>
                <button
                  className={`button ${!d.response || d.response === "unanswered" ? "primary" : "secondary"}`}
                  disabled={busy}
                  aria-pressed={!d.response || d.response === "unanswered"}
                  onClick={() => respond("unanswered")}
                >
                  미응답
                </button>
              </div>
            )}
          <p className="micro">
            게스트는 운영진이 입금을 확인한 인원만 표시됩니다.
          </p>
        </div>
      )}
    </Resource>
  );
}

export function CalendarScreen() {
  const { boot, link } = useApp();
  const [month, setMonth] = useState(seoulDate().slice(0, 7));
  const [selected, setSelected] = useState(seoulDate());
  const [editor, setEditor] = useState(false);
  const bounds = monthBounds(month);
  const covered =
    boot.eventCoverage &&
    boot.eventCoverage.from <= bounds.start &&
    boot.eventCoverage.until >= bounds.end &&
    Date.now() - boot.eventCoverage.generatedAt < 30000;
  const remote = useResource(covered ? null : `events?month=${month}`);
  const snapshot = useMemo(
    () =>
      covered
        ? boot.events.filter((event: ClubEvent) =>
            seoulDate(event.starts_at).startsWith(month),
          )
        : null,
    [boot.events, covered, month],
  );
  const resource = snapshot
    ? { data: snapshot, loading: false, error: "" }
    : remote;
  const days = useMemo(() => {
    const groups = new Map<string, ClubEvent[]>();
    for (const event of resource.data || []) {
      const day = seoulDate(event.starts_at);
      const group = groups.get(day);
      if (group) group.push(event);
      else groups.set(day, [event]);
    }
    return groups;
  }, [resource.data]);
  const kinds: ClubRow[] =
    boot.scheduleKinds ||
    Object.entries(eventKinds).map(([key, label]) => ({ key, label }));
  const byKind = new Map(kinds.map((k) => [k.key, k]));
  const [year, m] = month.split("-").map(Number);
  const count = new Date(year, m, 0).getDate(),
    first = new Date(year, m - 1, 1).getDay();
  const change = (amount: number) => {
    const d = new Date(year, m - 1 + amount, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelected(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    );
  };
  return (
    <>
      <PageTitle
        eyebrow="OUR SCHEDULE"
        title="함께 뛰는 날"
        description="코트에서 만날 다음 순간을 확인해요."
        action={
          boot.role === "admin" ? (
            <button
              className="icon-button bordered"
              aria-label="일정 추가"
              onClick={() => setEditor(true)}
            >
              <Plus />
            </button>
          ) : null
        }
      />
      <div className="calendar card">
        <div className="calendar-heading">
          <button
            className="icon-button"
            aria-label="이전 달"
            onClick={() => change(-1)}
          >
            <ChevronLeft />
          </button>
          <h2>
            {year}년 {m}월
          </h2>
          <button
            className="icon-button"
            aria-label="다음 달"
            onClick={() => change(1)}
          >
            <ChevronRight />
          </button>
        </div>
        <div className="calendar-grid weekdays">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <Resource resource={resource}>
          {(events) => (
            <div className="calendar-grid">
              {Array.from({ length: first }, (_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                const e = days.get(day) || [];
                return (
                  <button
                    aria-label={`${day}${e.length ? `, 일정 ${e.length}개, ${e.map((v: ClubEvent) => (v.is_emergency || v.status === "cancelled" ? "긴급 변경" : byKind.get(v.kind)?.label || eventKinds[v.kind])).join(", ")}` : ""}`}
                    aria-pressed={selected === day}
                    className={`${selected === day ? "selected" : ""} ${seoulDate() === day ? "today" : ""}`}
                    key={day}
                    onClick={() => setSelected(day)}
                  >
                    <span>{i + 1}</span>
                    <div className="calendar-dots">
                      {e.slice(0, 3).map((v: ClubEvent) => (
                        <i
                          key={v.id}
                          style={
                            v.is_emergency || v.status === "cancelled"
                              ? undefined
                              : { background: byKind.get(v.kind)?.color }
                          }
                          className={
                            v.status === "cancelled" || v.is_emergency
                              ? "cancelled"
                              : v.kind
                          }
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Resource>
        <div className="calendar-legend">
          {kinds.map((k) => (
            <span key={k.key}>
              <i className={k.key} style={{ background: k.color }} />
              {k.label}
            </span>
          ))}
          <span>
            <i className="cancelled" />
            긴급 변경
          </span>
        </div>
      </div>
      <SectionTitle
        title={`${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8))}일 일정`}
      />
      <Resource resource={resource}>
        {(events) => {
          const day = events.filter(
            (e: ClubEvent) => seoulDate(e.starts_at) === selected,
          );
          return day.length ? (
            day.map((e: ClubEvent) => (
              <div key={e.id} className="selected-day-event">
                <EventCard event={e} />
                <div className="card day-event-description">
                  <p>
                    {e.description || "상세 안내는 일정 화면에서 확인해주세요."}
                  </p>
                  <Badge tone={canApplyAsGuest(e) ? "green" : ""}>
                    {guestAvailability(e)}
                  </Badge>
                  {e.is_emergency && (
                    <p className="emergency-change">{e.change_reason}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <Empty icon={CalendarDays} title="등록된 일정이 없어요">
              다른 날짜를 선택해보세요.
            </Empty>
          );
        }}
      </Resource>
      {boot.member && (
        <Link className="button secondary full" href={link("/rules")}>
          <BookOpen size={17} />
          클럽 회칙 보기
        </Link>
      )}
      {boot.role === "admin" && <ScheduleTools kinds={kinds} />}
      {editor && <EventEditor day={selected} close={() => setEditor(false)} />}
    </>
  );
}

export function EventScreen({ id }: { id: string }) {
  const { boot, link, screen } = useApp();
  const resource = useResource(`events/${id}`);
  const [edit, setEdit] = useState(false);
  return (
    <>
      <Back
        href={screen.startsWith("/admin") ? "/admin/calendar" : "/calendar"}
        label="운동 일정"
      />
      <Resource resource={resource}>
        {(d) => (
          <>
            <EventCard event={d.event} featured />
            <div className="card prose">
              {d.event.is_emergency && (
                <div className="emergency-change" role="alert">
                  <strong>긴급 변경 안내</strong>
                  <p>{d.event.change_reason}</p>
                </div>
              )}
              <h2>오늘의 운동 안내</h2>
              <div className="detail-line">
                <span>일정 종류</span>
                <strong>
                  {boot.scheduleKinds?.find(
                    (k: ClubRow) => k.key === d.event.kind,
                  )?.label ||
                    eventKinds[d.event.kind] ||
                    d.event.kind}
                </strong>
              </div>
              <div className="detail-line">
                <span>게스트 신청</span>
                <Badge tone={canApplyAsGuest(d.event) ? "green" : ""}>
                  {guestAvailability(d.event)}
                </Badge>
              </div>
              <p>
                {d.event.description ||
                  "편안한 운동복과 실내 운동화를 준비해주세요."}
              </p>
              <div className="divider" />
              <div className="detail-line">
                <span>게스트 참가비</span>
                <strong>{d.event.guest_fee.toLocaleString()}원</strong>
              </div>
              <p className="micro">
                입금 후 운영진 확인 시 최종 참가가 확정됩니다.
              </p>
            </div>
            {boot.member ? (
              <EventActions event={d.event} />
            ) : canApplyAsGuest(d.event) ? (
              <Link
                href={link(`/guest-guide?event=${id}`)}
                className="button primary full"
              >
                공지 확인하고 게스트 신청
                <ArrowRight size={18} />
              </Link>
            ) : (
              <Empty title="현재 게스트 신청을 받지 않아요" />
            )}
            {boot.role === "admin" && (
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => setEdit(true)}
                >
                  일정 수정
                </button>
                <Link
                  className="button secondary"
                  href={link(`/admin/roster?event=${id}`)}
                >
                  참가 명단
                </Link>
              </div>
            )}
            {boot.member && (
              <>
                <SectionTitle title="이 날의 영상" />
                <Link
                  className="button secondary full"
                  href={link(`/videos?event=${id}`)}
                >
                  이 날의 영상 <Play size={18} />
                </Link>
                {d.videos.length ? (
                  d.videos
                    .slice(0, 3)
                    .map((v: ClubRow) => (
                      <VideoCard key={`${v.source}:${v.id}`} video={v} />
                    ))
                ) : (
                  <Empty icon={Play} title="등록된 영상이 없어요" />
                )}
              </>
            )}
            {edit && (
              <EventEditor event={d.event} close={() => setEdit(false)} />
            )}
          </>
        )}
      </Resource>
    </>
  );
}

export function NoticeCard({ notice }: { notice: ClubRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="notice-card" onClick={() => setOpen(true)}>
        <span>
          <Badge
            tone={
              notice.kind === "emergency"
                ? "red"
                : notice.kind === "required"
                  ? "gold"
                  : ""
            }
          >
            {
              (
                {
                  general: "공지",
                  required: "필독",
                  emergency: "긴급",
                  event: "이벤트",
                } as any
              )[notice.kind]
            }
          </Badge>
          <strong>{notice.title}</strong>
          <small>
            {formatDate(notice.created_at, {
              month: "numeric",
              day: "numeric",
            })}
          </small>
        </span>
        <ChevronRight size={18} />
      </button>
      {open && (
        <Modal title={notice.title} close={() => setOpen(false)}>
          <div className="prose">
            <p className="micro">
              공지 버전 v{notice.version || 1} ·{" "}
              {notice.updated_at
                ? formatDate(notice.updated_at)
                : formatDate(notice.created_at)}
            </p>
            <Badge>
              {notice.audience === "public"
                ? "전체 공개"
                : notice.audience === "admin"
                  ? "운영진"
                  : "회원"}
            </Badge>
            <p>{notice.content}</p>
          </div>
        </Modal>
      )}
    </>
  );
}

export function NoticesScreen() {
  const [kind, setKind] = useState("all"),
    [page, setPage] = useState(0);
  const resource = useResource(`notices?kind=${kind}&page=${page}`);
  return (
    <>
      <PageTitle eyebrow="CLUB NEWS" title="우리의 소식" />
      <Chips
        value={kind}
        onChange={(v) => {
          setKind(v);
          setPage(0);
        }}
        items={[
          { value: "all", label: "전체" },
          { value: "emergency", label: "긴급" },
          { value: "required", label: "필독" },
          { value: "general", label: "공지" },
          { value: "event", label: "이벤트" },
        ]}
      />
      <Resource resource={resource}>
        {(d) => (
          <>
            {d.rows.length ? (
              sortAnnouncements(d.rows as ClubRow[]).map((n) => (
                <NoticeCard key={n.id} notice={n} />
              ))
            ) : (
              <Empty icon={ClipboardList} title="등록된 공지가 없어요" />
            )}
            <Pagination
              page={page}
              total={d.total}
              size={20}
              setPage={setPage}
            />
          </>
        )}
      </Resource>
    </>
  );
}

export function GuestGuide() {
  const { link } = useApp();
  const params = useSearchParams();
  const event = params.get("event");
  const [confirmed, setConfirmed] = useState(false);
  const resource = useResource(event ? `guest-guidance?event=${event}` : null);
  return (
    <>
      <Back href={event ? `/events/${event}` : "/calendar"} label="운동 일정" />
      <PageTitle
        eyebrow="BEFORE YOU PLAY"
        title="참가 전 꼭 확인해주세요"
        description="일정과 공지·필독사항을 확인한 뒤 신청을 시작해요."
      />
      {event ? (
        <Resource resource={resource}>
          {(d) => (
            <>
              {d.event && <EventCard event={d.event} />}
              <SectionTitle title="공지 및 필독사항" />
              {d.announcements.length ? (
                d.announcements.map((n: ClubRow) => (
                  <details
                    className={`card prose ${n.kind === "emergency" ? "urgent-notice" : ""}`}
                    key={`${n.id}:${n.version}`}
                  >
                    <summary>
                      <Badge
                        tone={
                          n.kind === "emergency"
                            ? "red"
                            : n.kind === "required"
                              ? "gold"
                              : ""
                        }
                      >
                        {n.kind === "emergency"
                          ? "긴급"
                          : n.kind === "required"
                            ? "필독"
                            : n.kind === "event"
                              ? "이벤트"
                              : "공지"}
                      </Badge>{" "}
                      {n.title}
                    </summary>
                    <p>{n.content}</p>
                    <small>버전 v{n.version || 1}</small>
                  </details>
                ))
              ) : (
                <p className="hint">
                  현재 등록된 공개 공지가 없습니다. 신청서에서 운동 일정과 참가
                  안내를 확인해주세요.
                </p>
              )}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>운동 일정과 공지·필독사항을 확인했습니다.</span>
              </label>
              {confirmed && d.event && canApplyAsGuest(d.event) ? (
                <Link
                  className="button primary full"
                  href={link(`/apply?event=${event}`)}
                >
                  게스트 신청 시작
                  <ArrowRight size={17} />
                </Link>
              ) : (
                <button className="button primary full" disabled>
                  게스트 신청 시작
                </button>
              )}
              <p className="micro">
                제출 시 다시 확인한 공지·회칙 버전을 신청 기록에 보관합니다.
              </p>
            </>
          )}
        </Resource>
      ) : (
        <Empty icon={CalendarDays} title="참여할 운동을 먼저 선택해주세요">
          <Link className="button primary" href={link("/calendar")}>
            일정 확인하기
          </Link>
        </Empty>
      )}
    </>
  );
}

export function RulesScreen() {
  const { boot } = useApp();
  const [edit, setEdit] = useState(false);
  if (!boot.member)
    return (
      <Empty icon={BookOpen} title="회원 전용 회칙입니다">
        승인된 회원 계정으로 로그인하면 열람할 수 있습니다.
      </Empty>
    );
  const articles: ClubRow[] = (boot.rules as ClubRow[]).flatMap((r) => {
    const version = r.rule_versions?.find(
      (v: ClubRow) => v.version === r.current_version && v.published,
    );
    return version ? [{ ...r, version }] : [];
  });
  return (
    <>
      <PageTitle
        eyebrow="CLUB HANDBOOK"
        title="SpotLight 회칙"
        action={
          boot.role === "admin" ? (
            <button className="button secondary" onClick={() => setEdit(true)}>
              회칙 개정
            </button>
          ) : null
        }
      />
      {articles.length ? (
        <>
          <nav className="handbook-index card" aria-label="회칙 목차">
            <h2>목차</h2>
            {articles.map((r, i) => (
              <a key={r.id} href={"#rule-" + r.id}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {r.title}
              </a>
            ))}
          </nav>
          {articles.map((r, i) => (
            <article
              className="card handbook-article"
              id={"rule-" + r.id}
              key={r.id}
            >
              <header>
                <small>
                  {String(i + 1).padStart(2, "0")} /{" "}
                  {String(articles.length).padStart(2, "0")}
                </small>
                <Badge>제 {r.current_version}판</Badge>
              </header>
              <h2>{r.title}</h2>
              <div className="handbook-content">{r.version.content}</div>
            </article>
          ))}
        </>
      ) : (
        <Empty icon={BookOpen} title="게시된 회칙이 없습니다" />
      )}
      {edit && (
        <Modal title="회칙 개정" close={() => setEdit(false)}>
          <RuleForm done={() => setEdit(false)} />
        </Modal>
      )}
    </>
  );
}
