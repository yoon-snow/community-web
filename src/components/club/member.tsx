"use client";
import { notificationText } from "@/lib/notification-text";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList as ClipboardListIcon,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Info,
  LogIn,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Shirt,
  UserRound,
  Volleyball,
  Wallet,
  BookOpen,
} from "lucide-react";
import {
  eventKinds,
  videoCategories,
  canApplyAsGuest,
  formatTime,
  noticeVersions,
  positions,
  formatDate,
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
  SaveForm,
  Field,
  Chips,
  Stats,
  PageTitle,
  Back,
  Menu,
  Pagination,
  paymentLabel,
} from "./core";
import { GuestNotices } from "./guest-notices";
import { VideoCard } from "./video-card";
import { VideoEditor } from "./admin-forms";
import { AttendanceHistory } from "./attendance";
import { SupportLinks } from "./support-links";
import { AuthPanel } from "./auth";

export function ApplicationForm({
  membership = false,
}: {
  membership?: boolean;
}) {
  const { boot, mutate, link, toast } = useApp();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ClubRow>({
    event_id: params.get("event") || "",
    name: "",
    birth_date: "",
    gender: "",
    phone: "",
    position: "",
    experience: "",
    source: "",
    notes: "",
    current_month_guest: "",
    current_month_guest_participated: "",
    self_reported_paid: false,
    privacy_consent: false,
    photo_consent: false,
    rules_consent: false,
    notice_consent: false,
    fee_acknowledgement: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [confirmation, setConfirmation] = useState<ClubRow | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [agreements, setAgreements] = useState<{
    signature: string;
    rules: Record<string, number>;
    notices: Record<string, number>;
    questions: Record<string, number>;
  } | null>(null);
  const steps = [
    "기본 정보",
    "배구 정보",
    membership ? "가입 안내" : "참여 일정",
    "안내 및 동의",
    "입금 및 확인",
  ];
  const event = boot.events.find((e: ClubEvent) => e.id === values.event_id);
  const guidance = useResource(
    membership
      ? null
      : `guest-guidance${values.event_id ? `?event=${values.event_id}` : ""}`,
  );
  const confirmedNotices = membership
    ? boot.announcements
    : guidance.data?.announcements || [];
  const questions = boot.questions.filter(
    (q: ClubRow) =>
      q.form === (membership ? "member" : "guest") &&
      q.active !== false &&
      !q.deleted_at,
  );
  const extra = questions.filter((q: ClubRow) => !q.is_system);
  const questionVersions = Object.fromEntries(
    questions.map((q: ClubRow) => [q.id, q.version || 1]),
  );
  const question = (field: string) =>
    !membership &&
    questions.find((q: ClubRow) => q.is_system && q.field_key === field);
  const label = (field: string, fallback: string) =>
    question(field)?.label || fallback;
  const hint = (field: string) => question(field)?.help_text || undefined;
  const versions =
    boot.intakeRuleVersions ??
    Object.fromEntries(
      boot.rules
        .filter((r: ClubRow) =>
          r.rule_versions?.some(
            (v: ClubRow) => v.version === r.current_version && v.published,
          ),
        )
        .map((r: ClubRow) => [r.id, r.current_version]),
    );
  const agreementSignature = JSON.stringify({
    rules: versions,
    notices: membership ? {} : noticeVersions(confirmedNotices),
    questions: membership ? {} : questionVersions,
  });
  useEffect(() => {
    if (
      (membership || guidance.data) &&
      agreements &&
      agreements.signature !== agreementSignature
    ) {
      setAgreements(null);
      setValues((v) => ({
        ...v,
        rules_consent: false,
        notice_consent: false,
        photo_consent: false,
        privacy_consent: false,
        fee_acknowledgement: false,
      }));
    }
  }, [agreementSignature, agreements, membership, guidance.data]);
  const readForm = () => {
    const fd = new FormData(form.current!);
    const next = { ...values };
    for (const [key, value] of fd.entries()) next[key] = value;
    for (const key of [
      "privacy_consent",
      "photo_consent",
      "rules_consent",
      "notice_consent",
      "fee_acknowledgement",
    ])
      if (form.current?.querySelector(`[name="${key}"]`))
        next[key] = fd.has(key);
    if (fd.has("paid_answer"))
      next.self_reported_paid = fd.get("paid_answer") === "yes";
    setValues(next);
    return next;
  };
  const forward = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.current?.reportValidity()) return;
    const latest = readForm();
    if (!membership && step >= 3 && !guidance.data) {
      setError("참가 안내를 불러온 후 다시 시도해주세요.");
      return;
    }
    if (step === 3)
      setAgreements({
        signature: agreementSignature,
        rules: versions,
        notices: membership ? {} : noticeVersions(confirmedNotices),
        questions: membership ? {} : questionVersions,
      });
    if (step === 4 && !agreements) {
      setError("공지와 회칙을 다시 확인하고 동의해주세요.");
      setStep(3);
      return;
    }
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const extras = Object.fromEntries(
        Object.entries(latest)
          .filter(([k]) => k.startsWith("extra_"))
          .map(([k, v]) => [k.slice(6), v]),
      );
      const data = {
        ...latest,
        rule_versions: agreements!.rules,
        ...(!membership
          ? {
              announcement_versions: agreements!.notices,
              question_versions: agreements!.questions,
            }
          : {}),
        extra_answers: extras,
        ...(membership
          ? {
              current_month_guest_participated:
                latest.current_month_guest_participated === "yes",
            }
          : {}),
      };
      const result = await mutate(
        membership ? "membership" : "guest-applications",
        data,
      );
      if (!membership && result.support_proof) {
        try {
          sessionStorage.setItem(
            "spot-support-application",
            JSON.stringify({
              id: result.receipt,
              proof: result.support_proof,
              name: latest.name,
              phone: latest.phone,
              event: latest.event_id,
            }),
          );
        } catch {
          /* Manual entry remains available. */
        }
      }
      setReceipt(result.receipt || result.id);
      setConfirmation(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (membership && !boot.user)
    return (
      <>
        <Back href="/account" label="내 정보" />
        <PageTitle
          title="SpotLight 회원 가입"
          description="SpotLight 계정을 만들고 이메일을 확인한 뒤 가입 신청을 진행해요."
        />
        <AuthPanel />
      </>
    );
  if (membership && boot.application)
    return (
      <>
        <PageTitle title="가입 신청 현황" />
        <div className="card">
          <Badge tone="gold">
            {({ pending: "승인 대기", hold: "보류", rejected: "거절" } as any)[
              boot.application.status
            ] || boot.application.status}
          </Badge>
          <h2>
            {boot.application.status === "hold"
              ? "가입 신청이 보류되었습니다."
              : boot.application.status === "rejected"
                ? "가입 신청이 거절되었습니다."
                : "운영진이 신청을 확인하고 있어요."}
          </h2>
          <p>
            {boot.application.review_note ||
              "신청 내용이나 검토 결과에 대한 문의는 운영진에게 알려주세요."}
          </p>
          <p className="micro">
            승인 전에는 회원 전용 기능을 이용할 수 없습니다.
          </p>
        </div>
      </>
    );
  if (receipt)
    return (
      <div className="success-screen">
        <CheckCircle2 size={64} />
        <p className="eyebrow">YOU’RE ONE STEP CLOSER</p>
        <h1>{membership ? "가입 신청 완료" : "게스트 신청 완료"}</h1>
        <p>
          {membership
            ? "운영진 승인 후 회원 전용 기능을 이용할 수 있어요."
            : "운영진이 실제 입금을 확인하면 참가가 확정됩니다."}
        </p>
        {!membership && confirmation?.event && (
          <div className="card full" style={{ textAlign: "left" }}>
            <div className="detail-line">
              <span>신청 운동</span>
              <strong>{formatDate(confirmation.event.starts_at)}</strong>
            </div>
            <p>
              {confirmation.event.title} ·{" "}
              {formatTime(confirmation.event.starts_at)}–
              {formatTime(confirmation.event.ends_at)}
            </p>
            <p>{confirmation.event.location}</p>
            <div className="detail-line">
              <span>게스트비</span>
              <strong>{confirmation.payment.amount.toLocaleString()}원</strong>
            </div>
            <div className="detail-line">
              <span>현재 입금 상태</span>
              <Badge
                tone={confirmation.payment.status === "paid" ? "green" : "gold"}
              >
                {confirmation.payment.status === "paid"
                  ? "입금완료"
                  : "입금확인 전"}
              </Badge>
            </div>
            <p className="micro">
              본인 응답:{" "}
              {confirmation.self_reported_paid
                ? "입금했습니다"
                : "아직 입금하지 않았습니다"}{" "}
              · 실제 입금 상태는 운영진이 확인합니다.
            </p>
            <p>
              {confirmation.bank.bank} {confirmation.bank.account}
              <br />
              예금주 {confirmation.bank.holder}
            </p>
            <p>
              <strong>입금자명: {confirmation.depositor_name}</strong>
              <br />
              신청자 이름으로 입금해주세요. 이름이 다르면 운영진에게 알려주세요.
            </p>
            <button
              type="button"
              className="button secondary full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    confirmation.bank.account,
                  );
                  toast("계좌번호를 복사했습니다.");
                } catch {
                  toast("계좌번호를 길게 눌러 복사해주세요.");
                }
              }}
            >
              <Copy size={17} />
              계좌번호 복사
            </button>
            <p className="micro">
              위 입금 상태는 접수 시점 기준입니다. 이 완료 화면을 저장해두세요.
            </p>
          </div>
        )}
        <div className="card">
          <small>접수 번호</small>
          <code>{receipt}</code>
          <p className="micro">
            접수 번호를 저장해주세요. 확인이 필요하면 운영진에게 알려주세요.
          </p>
        </div>
        {!membership && (
          <>
            <Link className="button secondary full" href={link("/receipt")}>
              내 게스트 신청 확인
            </Link>
            <SupportLinks category="payment" />
          </>
        )}
        <Link href={link("/")} className="button primary full">
          홈으로 돌아가기
        </Link>
      </div>
    );
  return (
    <>
      <Back
        href={membership ? "/account" : "/calendar"}
        label={membership ? "회원 가입" : "게스트 신청"}
      />
      <PageTitle
        eyebrow={membership ? "JOIN OUR TEAM" : "JOIN THE COURT"}
        title={steps[step]}
        description={`${step + 1} / 5 · ${membership ? "함께할 준비를 시작해요" : "계정 없이 편하게 신청하세요"}`}
      />
      {!membership && step === 0 && (
        <Link className="text-button" href={link("/receipt")}>
          이미 신청하셨나요? 내 신청 조회
        </Link>
      )}
      <div className="progress" aria-label={`${step + 1}/5 단계`}>
        {steps.map((s, i) => (
          <span key={s} className={i <= step ? "filled" : ""} />
        ))}
      </div>
      {!boot.acceptingApplications && (
        <div className="setup-banner">
          <Info size={17} />
          미리 확인할 수 있지만, 운영 설정이 완료되기 전에는 접수할 수 없어요.
        </div>
      )}
      {!membership && step !== 3 && (
        <details className="card prose form-notices">
          <summary>공지 및 필독사항 확인하기</summary>
          <Resource resource={guidance}>
            {(d) => <GuestNotices notices={d.announcements} />}
          </Resource>
        </details>
      )}
      <form
        key={step}
        ref={form}
        className="form application-form"
        onSubmit={forward}
      >
        {step === 0 && (
          <>
            <Field
              label={label("name", "이름")}
              hint={hint("name")}
              name="name"
              value={values.name}
              required
              autoComplete="name"
              maxLength={80}
            />
            <Field
              label={label("birth_date", "생년월일")}
              hint={
                membership
                  ? hint("birth_date")
                  : "게스트는 신청일 기준 만 19세 이상만 신청할 수 있습니다."
              }
              name="birth_date"
              type="date"
              value={values.birth_date}
              required
              max={
                membership
                  ? seoulDate()
                  : String(Number(seoulDate().slice(0, 4)) - 19) +
                    seoulDate().slice(4)
              }
            />
            <Field
              label={label("gender", "성별")}
              hint={hint("gender")}
              name="gender"
              value={values.gender}
              required
            >
              <option value="">선택해주세요</option>
              {["여성", "남성", "기타", "응답하지 않음"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Field>
            <Field
              label={label("phone", "연락처")}
              hint={hint("phone")}
              name="phone"
              type="tel"
              value={values.phone}
              required
              autoComplete="tel"
              placeholder="010-0000-0000"
              pattern="[+0-9() -]{10,20}"
            />
          </>
        )}
        {step === 1 && (
          <>
            <Field
              label={label("position", "희망 포지션")}
              hint={hint("position")}
              name="position"
              value={values.position}
              required
            >
              <option value="">선택해주세요</option>
              {positions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Field>
            <Field
              label={label("experience", "배구 경력")}
              hint={hint("experience")}
              name="experience"
              value={values.experience}
              required
              placeholder="예: 초보자, 1년, 3년"
              maxLength={200}
            />
            <Field
              label={label("source", "SpotLight를 알게 된 경로")}
              hint={hint("source")}
              name="source"
              value={values.source}
            >
              <option value="">선택해주세요</option>
              {["Instagram", "지인", "기타"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Field>
            <Field
              label={label("notes", "기타 확인사항 및 질문")}
              hint={hint("notes")}
              name="notes"
              type="textarea"
              value={values.notes}
              maxLength={2000}
            />
            {extra.map((q: ClubRow) => (
              <Field
                key={q.id}
                label={q.label}
                name={`extra_${q.key}`}
                value={values[`extra_${q.key}`] || ""}
                required={q.required}
                type={q.type === "textarea" ? "textarea" : "text"}
                hint={q.help_text}
              >
                {q.type === "select" ? (
                  <>
                    <option value="">선택해주세요</option>
                    {q.options.map((o: string) => (
                      <option key={o}>{o}</option>
                    ))}
                  </>
                ) : undefined}
              </Field>
            ))}
          </>
        )}
        {step === 2 &&
          (membership ? (
            <>
              <div className="card prose">
                <Badge tone="gold">운영진 승인 후 활성화</Badge>
                <h2>함께하는 SpotLight 회원</h2>
                <p>가입비 50,000원 · 월 회비 60,000원</p>
                <p>
                  중도 가입 회비와 당월 게스트비 차감은 회칙에 따라 운영진이
                  확인합니다.
                </p>
              </div>
              <Field
                label="당월 게스트 참여 여부"
                name="current_month_guest_participated"
                value={values.current_month_guest_participated}
                required
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setValues((v) => ({
                    ...v,
                    current_month_guest_participated: e.target.value,
                  }))
                }
              >
                <option value="">선택해주세요</option>
                <option value="yes">참여했습니다</option>
                <option value="no">참여하지 않았습니다</option>
              </Field>
              <Field
                label="당월 게스트 참여 내역"
                name="current_month_guest"
                type="textarea"
                value={values.current_month_guest}
                placeholder="참여 날짜와 입금한 게스트비를 입력해주세요."
                maxLength={500}
                required={values.current_month_guest_participated === "yes"}
              />
            </>
          ) : (
            <>
              <Field
                label={label("event_id", "참여할 운동")}
                hint={hint("event_id")}
                name="event_id"
                value={values.event_id}
                required
              >
                <option value="">일정을 선택해주세요</option>
                {boot.events
                  .filter((e: ClubEvent) => canApplyAsGuest(e))
                  .map((e: ClubEvent) => (
                    <option value={e.id} key={e.id}>
                      {formatDate(e.starts_at)} · {eventKinds[e.kind]} ·{" "}
                      {e.guest_fee.toLocaleString()}원
                    </option>
                  ))}
              </Field>
              <p className="hint">
                <Info size={18} />
                장소와 시간은 일정 상세에서 확인해주세요. 신청 후 입금 확인
                전에는 참여가 확정되지 않습니다.
              </p>
            </>
          ))}
        {step === 3 && (
          <>
            <div className="card prose">
              <h2>신청 전 꼭 읽어주세요</h2>
              {!membership && guidance.loading && (
                <p role="status">최신 공지를 불러오고 있어요.</p>
              )}
              {!membership && guidance.error && (
                <p className="form-error" role="alert">
                  {guidance.error}
                </p>
              )}
              {!membership && guidance.data && (
                <GuestNotices notices={confirmedNotices} />
              )}
              {membership &&
                confirmedNotices
                  .filter(
                    (n: ClubRow) =>
                      n.kind === "required" ||
                      n.kind === "emergency" ||
                      n.kind === "general" ||
                      n.kind === "event",
                  )
                  .map((n: ClubRow) => (
                    <details key={n.id}>
                      <summary>
                        {n.kind === "emergency"
                          ? "[긴급] "
                          : n.kind === "required"
                            ? "[필독] "
                            : ""}
                        {n.title} · v{n.version || 1}
                      </summary>
                      <p>{n.content}</p>
                    </details>
                  ))}
              {boot.member &&
                boot.rules.map((r: ClubRow) => (
                  <details key={r.id}>
                    <summary>
                      {r.title} · v{r.current_version}
                    </summary>
                    <p>
                      {
                        r.rule_versions?.find(
                          (v: ClubRow) => v.version === r.current_version,
                        )?.content
                      }
                    </p>
                  </details>
                ))}
            </div>
            {!membership && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="notice_consent"
                  required
                  checked={Boolean(values.notice_consent)}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      notice_consent: e.target.checked,
                    }))
                  }
                />
                <span>
                  {label("notice_consent", "공지사항을 확인했습니다. (필수)")}
                  {hint("notice_consent") && (
                    <small className="micro">{hint("notice_consent")}</small>
                  )}
                </span>
              </label>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                name="rules_consent"
                required
                checked={Boolean(values.rules_consent)}
                onChange={(e) =>
                  setValues((v) => ({ ...v, rules_consent: e.target.checked }))
                }
              />
              <span>
                운동 일정과 참가 안내를 확인하고 동의합니다. (필수)
                {hint("rules_consent") && (
                  <small className="micro">{hint("rules_consent")}</small>
                )}
              </span>
            </label>
            <details className="card prose">
              <summary>개인정보 수집·이용 안내</summary>
              <p style={{ whiteSpace: "pre-line" }}>
                {boot.privacy?.text || "개인정보 안내를 준비 중입니다."}
              </p>
              {boot.privacy?.contact && (
                <p>개인정보 문의·삭제 요청: {boot.privacy.contact}</p>
              )}
            </details>
            <label className="checkbox">
              <input
                type="checkbox"
                name="privacy_consent"
                required
                defaultChecked={values.privacy_consent}
              />
              <span>
                {label(
                  "privacy_consent",
                  "개인정보 수집·이용에 동의합니다. (필수)",
                )}
                {hint("privacy_consent") && (
                  <small className="micro">{hint("privacy_consent")}</small>
                )}
              </span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="photo_consent"
                required
                defaultChecked={values.photo_consent}
              />
              <span>
                {label(
                  "photo_consent",
                  "활동 사진·영상이 동호회 기록 및 홍보에 활용되는 안내를 확인하고 동의합니다. (필수)",
                )}
                {hint("photo_consent") && (
                  <small className="micro">{hint("photo_consent")}</small>
                )}
              </span>
            </label>
          </>
        )}
        {step === 4 && (
          <>
            <div className="bank-card">
              <span>입금 계좌</span>
              <h2>{boot.bank.bank}</h2>
              <strong>{boot.bank.account}</strong>
              <p>예금주 {boot.bank.holder}</p>
              <button
                type="button"
                className="button secondary full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(boot.bank.account);
                    toast("계좌번호를 복사했습니다.");
                  } catch {
                    toast("계좌번호를 길게 눌러 복사해주세요.");
                  }
                }}
              >
                <Copy size={17} />
                계좌번호 복사
              </button>
            </div>
            <div className="card">
              <p className="hint">
                신청자 이름 <strong>{values.name}</strong>으로 입금해주세요.
              </p>
              <div className="detail-line">
                <span>신청자</span>
                <strong>{values.name}</strong>
              </div>
              {event && (
                <div className="detail-line">
                  <span>참가 일정</span>
                  <strong>{formatDate(event.starts_at)}</strong>
                </div>
              )}
              <div className="detail-line">
                <span>{membership ? "가입비 / 월 회비" : "참가비"}</span>
                <strong>
                  {membership
                    ? "50,000원 / 60,000원"
                    : `${event?.guest_fee.toLocaleString() || "—"}원`}
                </strong>
              </div>
            </div>
            <Field
              label={
                membership
                  ? "가입비 및 회비 입금 여부"
                  : label("self_reported_paid", "입금을 완료하셨나요?")
              }
              hint={hint("self_reported_paid")}
              name="paid_answer"
              value={values.self_reported_paid ? "yes" : "no"}
              required
            >
              <option value="no">아직 입금하지 않았습니다</option>
              <option value="yes">입금했습니다</option>
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                name="fee_acknowledgement"
                required
                defaultChecked={values.fee_acknowledgement}
              />
              <span>
                {label(
                  "fee_acknowledgement",
                  "운영진의 실제 입금 확인 후 확정됨을 이해했습니다.",
                )}
                {hint("fee_acknowledgement") && (
                  <small className="micro">{hint("fee_acknowledgement")}</small>
                )}
              </span>
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <div className="button-row">
          {step > 0 && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                readForm();
                setStep(step - 1);
              }}
            >
              이전
            </button>
          )}
          <button
            className="button primary"
            disabled={busy || (step === 4 && !boot.acceptingApplications)}
          >
            {busy ? (
              "접수 중…"
            ) : step === 4 ? (
              "신청 완료"
            ) : (
              <>
                <span>다음</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}

export function AccountScreen() {
  const { boot, link, installApp } = useApp();
  const params = useSearchParams();
  return (
    <>
      <PageTitle eyebrow="MY SPOTLIGHT" title="내 정보" />
      {params.get("password") === "updated" && (
        <p className="hint" role="status">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
        </p>
      )}
      {params.get("error") && (
        <div className="error-box" role="alert">
          {params.get("error") === "setup"
            ? "로그인 서비스 연결을 준비 중입니다."
            : "인증이 완료되지 않았습니다. 다시 시도해주세요."}
        </div>
      )}
      {boot.member ? (
        <>
          <Link href={link("/profile")} className="profile-card card">
            <Avatar member={boot.member} size="large" />
            <div>
              <Badge tone="gold">
                {boot.role === "admin"
                  ? boot.titles.join(" · ")
                  : "SpotLight Member"}
              </Badge>
              <h2>{boot.member.name}</h2>
              <p>
                {boot.member.position || "포지션 미정"} ·{" "}
                {boot.member.joined_on} 가입
              </p>
            </div>
            <ChevronRight size={20} />
          </Link>
          <Menu
            items={[
              { href: "/support", label: "문의하기", icon: Info },
              {
                href: "/support/mine",
                label: "내 문의",
                icon: ClipboardListIcon,
              },
              { href: "/attendance", label: "내 출석", icon: CheckCircle2 },
              { href: "/dues", label: "내 회비", icon: Wallet },
              { href: "/videos", label: "영상·재생목록", icon: Play },
              { href: "/uniform", label: "유니폼", icon: Shirt },
              { href: "/rules", label: "회칙", icon: BookOpen },
              { href: "/notifications", label: "알림", icon: Bell },
              ...(boot.role === "admin"
                ? [{ href: "/admin", label: "운영진 모드", icon: ShieldCheck }]
                : []),
            ]}
          />
        </>
      ) : boot.user ? (
        <div className="card">
          <Badge tone="gold">
            {boot.application
              ? (
                  {
                    pending: "가입 승인 대기",
                    hold: "가입 보류",
                    rejected: "가입 거절",
                  } as any
                )[boot.application.status] || "가입 신청"
              : "회원 가입 전"}
          </Badge>
          <h2>반가워요!</h2>
          <p>{boot.user.email}</p>
          <Link href={link("/join")} className="button primary full">
            회원가입 신청 {boot.application ? "현황" : "하기"}
          </Link>
        </div>
      ) : (
        <AuthPanel />
      )}
      <SectionTitle title="앱 설정" />
      <div className="menu-list">
        <button onClick={installApp}>
          <Download size={20} />
          <span>홈 화면에 앱 설치</span>
          <ChevronRight size={18} />
        </button>
        {boot.member && (
          <Link href={link("/rules")}>
            <BookOpen size={20} />
            <span>SpotLight 회칙</span>
            <ChevronRight size={18} />
          </Link>
        )}
        {boot.user && !boot.preview && (
          <form action="/auth/logout" method="post">
            <button>
              <LogIn size={20} />
              <span>로그아웃</span>
              <ChevronRight size={18} />
            </button>
          </form>
        )}
      </div>
    </>
  );
}

export function ProfileScreen() {
  const { boot, mutate, toast } = useApp();
  const [uploading, setUploading] = useState(false);
  const activity = useResource(boot.member ? "me" : null);
  if (!boot.member) return <AuthPanel />;
  const member = boot.member;
  return (
    <>
      <Back href="/account" label="내 정보" />
      <PageTitle title="내 프로필" />
      <div className="profile-photo">
        <Avatar member={member} size="xlarge" />
        <label className="button secondary">
          {uploading
            ? "사진 업로드 중…"
            : member.avatar_path
              ? "사진 변경"
              : "사진 등록"}
          <input
            hidden
            type="file"
            aria-label="프로필 사진 선택"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              if (file.size > 5_242_880) {
                toast("5MB 이하의 사진을 선택해주세요.");
                input.value = "";
                return;
              }
              setUploading(true);
              try {
                const content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                await mutate("avatar", { content, type: file.type });
                toast("프로필 사진을 저장했습니다.");
              } catch (e) {
                toast((e as Error).message);
              } finally {
                input.value = "";
                setUploading(false);
              }
            }}
          />
        </label>
        {member.avatar_path && (
          <button
            className="text-button danger-text"
            disabled={uploading}
            onClick={async () => {
              setUploading(true);
              try {
                await mutate("avatar", {}, "DELETE");
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          >
            사진 삭제
          </button>
        )}
      </div>
      <div className="card">
        <h2>{member.name}</h2>
        <p>
          {boot.role === "admin" ? "관리자" : "SpotLight 회원"} ·{" "}
          {member.position || "포지션 미정"}
        </p>
        {boot.role === "admin" && (
          <p>직책·역할: {boot.titles?.join(" · ") || "운영진"}</p>
        )}
        <div className="detail-line">
          <span>가입일</span>
          <strong>{member.joined_on}</strong>
        </div>
        <div className="detail-line">
          <span>생년월일</span>
          <strong>{member.birth_date || "미등록"}</strong>
        </div>
        <div className="detail-line">
          <span>회원 상태</span>
          <Badge tone={member.status === "active" ? "green" : "gold"}>
            {
              ({ active: "활성", inactive: "휴면", withdrawn: "탈퇴" } as any)[
                member.status
              ]
            }
          </Badge>
        </div>
      </div>
      <SectionTitle title="연락처 · 배구 정보" />
      <SaveForm
        onSubmit={async (f) => {
          await mutate(
            "profile",
            {
              phone: f.get("phone"),
              position: f.get("position"),
              experience: f.get("experience"),
            },
            "PATCH",
          );
        }}
      >
        <Field
          label="연락처"
          name="phone"
          value={member.phone}
          type="tel"
          required
        />
        <Field label="포지션" name="position" value={member.position}>
          {!positions.includes(member.position) && (
            <option value={member.position}>{member.position || "미정"}</option>
          )}
          {positions.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Field>
        <Field
          label="배구 경력"
          name="experience"
          value={member.experience}
          maxLength={200}
        />
      </SaveForm>
      <SectionTitle title="내 유니폼" />
      <Resource resource={activity}>
        {(d) => (
          <div className="card">
            <p>
              {d.uniform
                ? `${d.uniform.nickname || member.name} · ${d.uniform.number || "번호 미등록"}번`
                : "등록된 유니폼 정보가 없습니다."}
            </p>
            {d.uniform && (
              <p>
                상의 {d.uniform.top_size || "—"} · 하의{" "}
                {d.uniform.bottom_size || "—"}
              </p>
            )}
          </div>
        )}
      </Resource>
      <NameChangeRequests />
    </>
  );
}

function NameChangeRequests() {
  const { mutate } = useApp();
  const resource = useResource("name-requests");
  const [editing, setEditing] = useState(false);
  return (
    <>
      <SectionTitle title="이름 변경 요청" />
      <p className="micro">
        운영진 승인 후 이름이 바뀝니다. 출석·회비·일정 기록은 같은 회원 계정에
        유지됩니다.
      </p>
      <Resource resource={resource}>
        {(rows) => (
          <>
            {rows.some((r: ClubRow) => r.status === "pending") ? (
              <p className="hint">검토 중인 이름 변경 요청이 있습니다.</p>
            ) : (
              !editing && (
                <button
                  className="button secondary full"
                  onClick={() => setEditing(true)}
                >
                  이름 변경 요청하기
                </button>
              )
            )}
            {editing && (
              <SaveForm
                onSubmit={async (f) => {
                  await mutate("name-requests", {
                    name: f.get("name"),
                    reason: f.get("reason"),
                  });
                  setEditing(false);
                }}
              >
                <Field
                  label="변경할 이름"
                  name="name"
                  required
                  maxLength={80}
                />
                <Field
                  label="변경 사유"
                  name="reason"
                  type="textarea"
                  maxLength={1000}
                />
              </SaveForm>
            )}
            {rows.map((r: ClubRow) => (
              <div className="card" key={r.id}>
                <div className="detail-line">
                  <strong>
                    {r.previous_name} → {r.requested_name}
                  </strong>
                  <Badge tone={r.status === "approved" ? "green" : "gold"}>
                    {
                      (
                        {
                          pending: "승인 대기",
                          approved: "승인",
                          rejected: "거절",
                        } as any
                      )[r.status]
                    }
                  </Badge>
                </div>
                <p className="micro">{formatDate(r.submitted_at)} 신청</p>
                {r.review_note && <p>{r.review_note}</p>}
              </div>
            ))}
          </>
        )}
      </Resource>
    </>
  );
}

export function MyActivity({
  dues = false,
  uniform = false,
}: {
  dues?: boolean;
  uniform?: boolean;
}) {
  const { boot } = useApp();
  const resource = useResource(boot.member && (dues || uniform) ? "me" : null);
  if (!boot.member) return <AuthPanel />;
  return (
    <>
      <Back href="/account" label="내 정보" />
      <PageTitle
        eyebrow="MY ACTIVITY"
        title={dues ? "내 회비" : uniform ? "내 유니폼" : "내 출석"}
      />
      {!dues && !uniform ? (
        <AttendanceHistory />
      ) : (
        <Resource resource={resource}>
          {(d) =>
            uniform ? (
              <div className="uniform-card card">
                <Shirt size={60} strokeWidth={1} />
                <strong>{d.uniform?.number || "—"}</strong>
                <h2>{d.uniform?.nickname || boot.member.name}</h2>
                {d.uniform ? (
                  <div className="count-row">
                    <span>
                      상의 <b>{d.uniform.top_size}</b>
                    </span>
                    <span>
                      하의 <b>{d.uniform.bottom_size}</b>
                    </span>
                  </div>
                ) : (
                  <p>등록된 유니폼 정보가 없습니다.</p>
                )}
              </div>
            ) : (
              <>
                <p className="hint">
                  본인의 회비 정보만 표시됩니다. 수정은 운영진에게 문의해주세요.
                </p>
                {d.payments.length ? (
                  d.payments.map((p: ClubRow) => (
                    <div className="list-card" key={p.id}>
                      <span className="list-icon">
                        <Wallet size={21} />
                      </span>
                      <div>
                        <strong>{p.month.slice(0, 7)} 회비</strong>
                        <small>{p.amount.toLocaleString()}원</small>
                      </div>
                      <Badge
                        tone={
                          p.status === "paid"
                            ? "green"
                            : p.status === "unpaid"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {paymentLabel(p.status)}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <Empty icon={Wallet} title="등록된 회비가 없어요" />
                )}
              </>
            )
          }
        </Resource>
      )}
    </>
  );
}

export function NotificationsScreen() {
  const { boot, mutate, toast } = useApp();
  const resource = useResource(boot.member ? "notifications" : null);
  const router = useRouter();
  const { link } = useApp();
  const [pushBusy, setPushBusy] = useState(false);
  return (
    <>
      <PageTitle title="알림" />
      {boot.member ? (
        <>
          <button
            className="button secondary full"
            disabled={pushBusy}
            onClick={async () => {
              setPushBusy(true);
              try {
                if (
                  !("serviceWorker" in navigator) ||
                  !("PushManager" in window) ||
                  !("Notification" in window)
                ) {
                  toast(
                    "이 브라우저는 Push 알림을 지원하지 않아요. 앱 안에서 알림을 확인할 수 있습니다.",
                  );
                  return;
                }
                if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
                  toast("Push 서비스 설정을 준비 중입니다.");
                  return;
                }
                if ((await Notification.requestPermission()) !== "granted") {
                  toast(
                    "Push 권한을 허용하지 않아도 앱 알림은 확인할 수 있어요.",
                  );
                  return;
                }
                const registration = await navigator.serviceWorker.ready;
                const text = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                const padded = (text + "=".repeat((4 - (text.length % 4)) % 4))
                  .replace(/-/g, "+")
                  .replace(/_/g, "/");
                const key = Uint8Array.from(atob(padded), (c) =>
                  c.charCodeAt(0),
                );
                const subscription = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: key,
                });
                await mutate("push", subscription.toJSON());
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setPushBusy(false);
              }
            }}
          >
            <Bell size={18} />
            {pushBusy ? "설정 중…" : "중요 소식을 Push로 받기"}
          </button>
          <p className="micro">
            iPhone은 홈 화면에 설치한 앱에서 알림을 켜주세요.
          </p>
          <Resource resource={resource}>
            {(rows) =>
              rows.length ? (
                rows.map((n: ClubRow) => (
                  <button
                    className={`notification-card ${n.read_at ? "" : "unread"}`}
                    key={n.id}
                    onClick={async () => {
                      try {
                        if (!boot.preview)
                          await mutate("notifications/read", { id: n.id });
                        router.push(link(n.href));
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    }}
                  >
                    <span className="list-icon">
                      <Bell size={20} />
                    </span>
                    <div>
                      <strong>{notificationText(n.title, "SpotLight 알림")}</strong>
                      <p>{notificationText(n.body, "앱에서 자세한 내용을 확인해주세요.")}</p>
                      <small>{formatDate(n.created_at)}</small>
                    </div>
                    {!n.read_at && <span className="unread-dot" />}
                  </button>
                ))
              ) : (
                <Empty icon={Bell} title="새 알림이 없어요">
                  중요한 소식이 생기면 알려드릴게요.
                </Empty>
              )
            }
          </Resource>
        </>
      ) : (
        <AuthPanel />
      )}
    </>
  );
}

export function VideosScreen({ admin = false }: { admin?: boolean }) {
  const { boot } = useApp();
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const params = useSearchParams();
  const [event, setEvent] = useState(params.get("event") || "");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<ClubRow | boolean>(false);
  const resource = useResource(
    boot.member
      ? `videos?kind=${kind}&q=${encodeURIComponent(q)}&year=${year}&month=${month}&event=${event}&page=${page}`
      : null,
  );
  if (!boot.member)
    return (
      <>
        <PageTitle title="우리의 플레이 기록" />
        <AuthPanel />
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow="ON THE COURT"
        title={admin ? "영상 관리" : "우리의 플레이 기록"}
        description="함께 뛴 순간을 다시 만나요."
        action={
          admin ? (
            <button
              className="icon-button bordered"
              aria-label="영상 등록"
              onClick={() => setEdit(true)}
            >
              <Plus />
            </button>
          ) : null
        }
      />
      <label className="search-box">
        <Search size={19} />
        <input
          aria-label="영상 검색"
          placeholder="제목, 설명으로 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <Chips
        value={kind}
        onChange={(v) => {
          setKind(v);
          setPage(0);
        }}
        items={[
          { value: "all", label: "전체" },
          ...Object.entries(videoCategories).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
      />
      <div className="filter-row">
        <select
          aria-label="영상 연도"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            if (!e.target.value) setMonth("");
            setPage(0);
          }}
        >
          <option value="">모든 연도</option>
          {Array.from(
            { length: 6 },
            (_, i) => new Date().getFullYear() - i,
          ).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select
          aria-label="영상 월"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            if (e.target.value && !year)
              setYear(String(new Date().getFullYear()));
            setPage(0);
          }}
        >
          <option value="">모든 월</option>
          {Array.from({ length: 12 }, (_, i) =>
            String(i + 1).padStart(2, "0"),
          ).map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
        <select
          aria-label="연결 일정"
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            setPage(0);
          }}
        >
          <option value="">모든 일정</option>
          {boot.events.map((e: ClubEvent) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </div>
      <Resource resource={resource}>
        {(d) => (
          <>
            {d.rows.length ? (
              d.rows.map((v: ClubRow) => (
                <div key={`${v.source || "videos"}:${v.id}`}>
                  <VideoCard video={v} />
                  {admin && (
                    <button className="text-button" onClick={() => setEdit(v)}>
                      영상 수정
                    </button>
                  )}
                </div>
              ))
            ) : (
              <Empty icon={Play} title="아직 등록된 영상이 없어요">
                영상이 등록되면 여기에서 볼 수 있어요.
              </Empty>
            )}
            <Pagination
              page={page}
              total={d.total}
              size={24}
              setPage={setPage}
            />
          </>
        )}
      </Resource>
      {edit && (
        <VideoEditor
          video={typeof edit === "object" ? edit : undefined}
          close={() => setEdit(false)}
        />
      )}
    </>
  );
}

export function VideoDetailScreen({
  source,
  id,
}: {
  source: string;
  id: string;
}) {
  const { boot, link } = useApp();
  const resource = useResource(boot.member ? `${source}/${id}` : null);
  if (!boot.member) return <AuthPanel />;
  return (
    <>
      <Back href="/videos" label="영상 목록" />
      <Resource resource={resource}>
        {({ entry: v, event }) =>
          v ? (
            <>
              <PageTitle title={v.title} />
              <div className="card video-card">
                <div className="video-thumbnail">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt={`${v.title} 썸네일`} />
                  ) : (
                    <Volleyball size={56} />
                  )}
                </div>
                <div className="video-info">
                  <Badge tone={v.kind}>{videoCategories[v.kind]}</Badge>
                  <p>
                    {formatDate(v.filmed_on + "T12:00:00+09:00")}
                    {v.date_source === "registered" ? " 등록" : ""}
                  </p>
                  {v.entry_type === "playlist" && (
                    <p>
                      {v.video_count == null
                        ? "영상 수 미등록"
                        : `${v.video_count} Videos`}
                    </p>
                  )}
                </div>
              </div>
              <div className="card prose">
                <h2>영상 안내</h2>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {v.description || "등록된 설명이 없습니다."}
                </p>
                {event && (
                  <Link
                    className="button secondary full"
                    href={link(`/events/${event.id}`)}
                  >
                    {formatDate(event.starts_at)} · {event.title}
                    <ChevronRight size={16} />
                  </Link>
                )}
                <a
                  className="button primary full"
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  YouTube에서 보기 <ExternalLink size={16} />
                </a>
              </div>
            </>
          ) : (
            <Empty title="영상을 찾을 수 없어요" />
          )
        }
      </Resource>
    </>
  );
}
