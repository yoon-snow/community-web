"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileUp,
  Info,
  Share2,
} from "lucide-react";
import {
  positions,
  formatDate,
  seoulDate,
  type ClubRow,
  type ClubEvent,
} from "@/lib/domain";

import {
  importColumns,
  coerceImportCell,
  type ImportEntity,
} from "@/lib/import";
import {
  useApp,
  useResource,
  Empty,
  Resource,
  SectionTitle,
  Modal,
  Field,
  Stats,
  PageTitle,
  downloadBlob,
  parseCsv,
} from "./core";

export function AnalyticsScreen() {
  const [month, setMonth] = useState(seoulDate().slice(0, 7));
  const resource = useResource(`admin/analytics?month=${month}`);
  return (
    <>
      <PageTitle
        eyebrow="CLUB INSIGHTS"
        title="한눈에 보는 SpotLight"
        description="우리 팀이 함께 쌓아가는 기록"
      />
      <input
        className="month-input"
        aria-label="대시보드 월"
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <Resource resource={resource}>
        {(d) => (
          <>
            <Stats
              items={[
                { label: "이번 달 게스트 신청", value: d.guest_applications },
                { label: "활성 회원", value: d.active_members },
                { label: "평균 참가", value: d.average_participants },
                { label: "회비 납부율", value: d.payment_rate + "%" },
              ]}
            />
            <div className="card">
              <SectionTitle title="게스트 방문" />
              <div className="count-row">
                <span>
                  신규 <b>{d.new_guests}</b>
                </span>
                <span>
                  재방문 <b>{d.returning_guests}</b>
                </span>
                <span>
                  재방문율{" "}
                  <b>
                    {d.guest_applications
                      ? Math.round(
                          (d.returning_guests / d.guest_applications) * 100,
                        )
                      : 0}
                    %
                  </b>
                </span>
              </div>
            </div>
            <BarChart title="월별 게스트 신청" rows={d.monthly || []} />
            <BarChart title="게스트 포지션" rows={d.positions || []} />
            <BarChart title="배구 경력" rows={d.experience || []} />
            <BarChart title="유입 경로" rows={d.sources || []} />
            <BarChart
              title="요일별 신청"
              rows={(d.weekdays || []).map((r: ClubRow) => ({
                ...r,
                label:
                  ["", "월", "화", "수", "목", "금", "토", "일"][
                    Number(r.label)
                  ] + "요일",
              }))}
            />
            <BarChart
              title="회원별 실제 출석 · 전체 기간"
              rows={d.member_attendance || []}
            />
            <div className="card">
              <h2>운영 현황</h2>
              <div className="detail-line">
                <span>신규 가입 회원</span>
                <strong>{d.new_members}명</strong>
              </div>
              <div className="detail-line">
                <span>입금확인 전 게스트 · 전체</span>
                <strong>{d.pending_guests}명</strong>
              </div>
              <div className="detail-line">
                <span>이번 달 회비 미납</span>
                <strong>{d.unpaid_members}명</strong>
              </div>
            </div>
          </>
        )}
      </Resource>
    </>
  );
}

export function BarChart({ title, rows }: { title: string; rows: ClubRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value)));
  return (
    <div className="chart card">
      <h2>{title}</h2>
      {rows.length ? (
        <div
          role="img"
          aria-label={`${title}: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}
        >
          {rows.map((r, i) => (
            <div className="bar-row" key={i}>
              <span>{r.label}</span>
              <div className="bar-track">
                <i
                  style={{
                    width: `${Math.max(2, (Number(r.value) / max) * 100)}%`,
                  }}
                />
              </div>
              <b>{r.value}</b>
            </div>
          ))}
        </div>
      ) : (
        <p className="micro">분석할 데이터가 없습니다.</p>
      )}
    </div>
  );
}

export function RosterScreen() {
  const { boot, toast } = useApp();
  const params = useSearchParams();
  const [event, setEvent] = useState(
    params.get("event") ||
      boot.events.find((e: ClubEvent) => seoulDate(e.starts_at) === seoulDate())
        ?.id ||
      "",
  );
  const resource = useResource(event ? `admin/roster?event=${event}` : null);
  async function shareImage(d: ClubRow) {
    const canvas = document.createElement("canvas");
    const entries = [
      ...d.members.map((m: ClubRow) => ({
        name: m.name,
        position: m.position,
        type: "회원",
      })),
      ...d.guests.map((g: ClubRow) => ({ ...g, type: "게스트" })),
    ];
    canvas.width = 900;
    canvas.height = 360 + entries.length * 55;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#F7F7F5";
    c.fillRect(0, 0, 900, canvas.height);
    c.fillStyle = "#0F1F3D";
    c.fillRect(0, 0, 900, 250);
    c.fillStyle = "#C9A227";
    await document.fonts.load('400 26px "S-Core Dream"');
    await document.fonts.load('700 40px "S-Core Dream"');
    c.font = '700 28px "S-Core Dream", sans-serif';
    c.fillText("SPOTLIGHT VOLLEYBALL CLUB", 50, 65);
    c.fillStyle = "#fff";
    c.font = '700 40px "S-Core Dream", sans-serif';
    c.fillText(`${formatDate(d.event.starts_at)} 참가 명단`, 50, 130);
    c.font = '400 26px "S-Core Dream", sans-serif';
    c.fillText(
      `회원 ${d.members.length}명  ·  게스트 ${d.guests.length}명  ·  총 ${entries.length}명`,
      50,
      195,
    );
    c.fillStyle = "#101828";
    c.font = '400 26px "S-Core Dream", sans-serif';
    entries.forEach((r, i) =>
      c.fillText(
        `${i + 1}. [${r.type}] ${r.name} / ${r.position}`.slice(0, 55),
        50,
        320 + i * 55,
      ),
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이미지 생성 실패"))),
        "image/png",
      ),
    );
    const file = new File([blob], "spotlight-roster.png", {
      type: "image/png",
    });
    if (navigator.canShare?.({ files: [file] }))
      await navigator.share({ files: [file], title: "SpotLight 참가 명단" });
    else downloadBlob(blob, "spotlight-roster.png");
  }
  return (
    <>
      <PageTitle
        title="참가자 명단"
        description="참석 응답 회원과 입금 확인된 게스트만 포함됩니다."
      />
      <Field
        label="운동 일정"
        name="event"
        value={event}
        onChange={(e: any) => setEvent(e.target.value)}
      >
        <option value="">일정 선택</option>
        {boot.events.map((e: ClubEvent) => (
          <option key={e.id} value={e.id}>
            {formatDate(e.starts_at)} {e.title}
          </option>
        ))}
      </Field>
      {!event && (
        <Empty icon={ClipboardList} title="명단을 확인할 일정을 선택해주세요" />
      )}
      <Resource resource={resource}>
        {(d) => (
          <>
            <Stats
              items={[
                { label: "회원", value: d.members.length },
                { label: "게스트 확정", value: d.guests.length },
                {
                  label: "총 예상 참가",
                  value: d.members.length + d.guests.length,
                },
              ]}
            />
            <div className="card roster">
              <pre>{d.text}</pre>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(d.text);
                    toast("명단을 복사했습니다.");
                  } catch {
                    toast("명단을 길게 눌러 복사해주세요.");
                  }
                }}
              >
                <Copy size={17} />
                텍스트 복사
              </button>
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    if (navigator.share)
                      await navigator.share({
                        title: "SpotLight 참가 명단",
                        text: d.text,
                      });
                    else {
                      await navigator.clipboard.writeText(d.text);
                      toast("명단을 복사했습니다.");
                    }
                  } catch (e) {
                    if ((e as Error).name !== "AbortError")
                      toast("공유하지 못했습니다. 텍스트 복사를 이용해주세요.");
                  }
                }}
              >
                <Share2 size={17} />
                공유하기
              </button>
            </div>
            <button
              className="button secondary full"
              onClick={async () => {
                try {
                  await shareImage(d);
                } catch (e) {
                  if ((e as Error).name !== "AbortError")
                    toast("이미지를 생성하지 못했습니다.");
                }
              }}
            >
              이미지 카드로 공유
            </button>
            <p className="micro">
              공유 명단에는 전화번호·생년월일·동의내용이 포함되지 않습니다.
            </p>
          </>
        )}
      </Resource>
    </>
  );
}

export function ExportSheet({
  resource,
  query = "",
  close,
}: {
  resource: string;
  query?: string;
  close: () => void;
}) {
  const { boot } = useApp();
  const [format, setFormat] = useState("xlsx");
  const [filtered, setFiltered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="내보내기" close={close}>
      <p className="hint">
        관리자 전용 파일입니다. 개인정보 취급에 주의해주세요.
      </p>
      <div className="export-options">
        {[
          { value: "xlsx", label: "Excel (.xlsx)" },
          { value: "csv", label: "CSV (.csv)" },
        ].map((i) => (
          <label key={i.value}>
            <input
              type="radio"
              value={i.value}
              checked={format === i.value}
              onChange={() => setFormat(i.value)}
            />
            <Download size={22} />
            <strong>{i.label}</strong>
          </label>
        ))}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={filtered}
          onChange={(e) => setFiltered(e.target.checked)}
        />
        <span>현재 필터 포함</span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (boot.preview)
              throw new Error(
                "미리보기에는 실제 개인정보 파일을 생성하지 않습니다.",
              );
            const response = await fetch(
              `/api/club/admin/export?resource=${resource}&format=${format}${filtered && query ? "&" + query : ""}`,
              { cache: "no-store" },
            );
            if (!response.ok) throw new Error((await response.json()).error);
            downloadBlob(
              await response.blob(),
              `spotlight-${resource}.${format}`,
            );
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "파일 생성 중…" : "파일 생성"}
      </button>
    </Modal>
  );
}

export function ExportScreen() {
  const [resource, setResource] = useState("guests");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [member, setMember] = useState("");
  const [event, setEvent] = useState("");
  const [open, setOpen] = useState(false);
  const { boot } = useApp();
  return (
    <>
      <PageTitle
        eyebrow="YOUR CLUB DATA"
        title="데이터 내보내기"
        description="기간과 상태를 선택해 운영 자료를 내려받아요."
      />
      <div className="form">
        <Field
          label="데이터 종류"
          name="resource"
          value={resource}
          onChange={(e: any) => {
            setResource(e.target.value);
            setStatus("all");
          }}
        >
          {[
            { value: "guests", label: "게스트 신청" },
            { value: "members", label: "회원" },
            { value: "attendance", label: "출석" },
            { value: "dues", label: "회비" },
            { value: "events", label: "운동 일정" },
          ].map((i) => (
            <option value={i.value} key={i.value}>
              {i.label}
            </option>
          ))}
        </Field>
        <div className="filter-row">
          <Field
            label="시작일"
            name="from"
            type="date"
            value={from}
            onChange={(e: any) => setFrom(e.target.value)}
          />
          <Field
            label="종료일"
            name="to"
            type="date"
            value={to}
            onChange={(e: any) => setTo(e.target.value)}
          />
        </div>
        {["guests", "members", "dues"].includes(resource) && (
          <Field
            label="상태"
            name="status"
            value={status}
            onChange={(e: any) => setStatus(e.target.value)}
          >
            <option value="all">전체</option>
            {(resource === "guests"
              ? [
                  ["paid", "입금완료"],
                  ["pending", "입금확인 전"],
                ]
              : resource === "members"
                ? [
                    ["active", "활성"],
                    ["inactive", "휴면"],
                    ["withdrawn", "탈퇴"],
                  ]
                : [
                    ["paid", "납부완료"],
                    ["unpaid", "미납"],
                    ["exempt", "면제"],
                  ]
            ).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Field>
        )}
        {["attendance", "dues"].includes(resource) && (
          <Field
            label="회원 ID · 선택"
            name="member"
            value={member}
            onChange={(e: any) => setMember(e.target.value)}
            placeholder="특정 회원의 UUID"
          />
        )}
        {["attendance", "guests"].includes(resource) && (
          <Field
            label="운동 일정"
            name="event"
            value={event}
            onChange={(e: any) => setEvent(e.target.value)}
          >
            <option value="">전체 일정</option>
            {boot.events.map((e: ClubEvent) => (
              <option value={e.id} key={e.id}>
                {formatDate(e.starts_at)} {e.title}
              </option>
            ))}
          </Field>
        )}
        <button className="button primary full" onClick={() => setOpen(true)}>
          <ArrowDownToLine size={18} />
          내보내기
        </button>
      </div>
      {open && (
        <ExportSheet
          resource={resource}
          query={`from=${from}&to=${to}&status=${status}&member=${member}&event=${event}`}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function ImportScreen() {
  const { boot, mutate } = useApp();
  const [entity, setEntity] = useState<ImportEntity>("members");
  const [sheets, setSheets] = useState<{ name: string; rows: unknown[][] }[]>(
    [],
  );
  const [tab, setTab] = useState(0);
  const [header, setHeader] = useState(1);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [complete, setComplete] = useState(false);
  const source = sheets[tab]?.rows || [];
  const headers = (source[header - 1] || []).map((v) => String(v ?? ""));
  const cols = importColumns[entity];
  useEffect(() => {
    setMapping(
      Object.fromEntries(cols.map((k) => [k, headers.includes(k) ? k : ""])),
    );
    setPreview(null);
    setConfirmed(false);
    setComplete(false);
  }, [entity, tab, header, sheets]);
  async function read(file: File) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      if (file.size > 5_242_880)
        throw new Error("5MB 이하의 파일을 선택해주세요.");
      if (!/\.(csv|xlsx)$/i.test(file.name))
        throw new Error(".xlsx 또는 .csv 파일을 선택해주세요.");
      const next: { name: string; rows: unknown[][] }[] = [];
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const readExcel = (await import("read-excel-file/browser")).default;
        const workbook = await readExcel(file);
        for (const sheet of workbook) {
          if (
            sheet.data.length > 2500 ||
            sheet.data.some((r) => r.length > 120)
          )
            throw new Error("시트는 2,500행·120열 이하로 나눠 업로드해주세요.");
          next.push({
            name: sheet.sheet,
            rows: sheet.data.map((row) =>
              row.map((v) => (v instanceof Date ? seoulDate(v) : (v ?? ""))),
            ),
          });
        }
      } else {
        const text = (await file.text()).replace(/^\uFEFF/, "");
        next.push({ name: "CSV", rows: parseCsv(text) });
      }
      setSheets(next);
      setTab(0);
      setHeader(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BRING YOUR HISTORY"
        title="기존 데이터 Import"
        description="매핑 → 미리보기 → 운영진 확정 순서로 반영해요."
      />
      <div className="hint">
        <Info size={18} />
        <span>
          원본 시트는 수정하지 않습니다. 가로형 출석·회비는 변환 도구로 세로형
          CSV를 만든 뒤 업로드해주세요. 이름만으로 회원을 연결하지 않아요.
        </span>
      </div>
      <div className="form">
        <Field
          label="Import 대상"
          name="entity"
          value={entity}
          onChange={(e: any) => setEntity(e.target.value)}
        >
          {Object.keys(importColumns).map((e) => (
            <option key={e} value={e}>
              {
                (
                  {
                    members: "회원",
                    guests: "게스트 기본정보",
                    events: "운동 일정",
                    guest_applications: "게스트 신청·입금",
                    member_applications: "회원 가입신청",
                    membership_payments: "월 회비",
                    event_attendance: "실제 출석",
                    uniforms: "유니폼",
                    rules: "회칙",
                  } as any
                )[e]
              }
            </option>
          ))}
        </Field>
        <a
          className="button secondary full"
          href={`/api/club/admin/import/template?entity=${entity}`}
        >
          <Download size={17} />
          양식 CSV 다운로드
        </a>
        <label className="file-drop">
          <FileUp size={28} />
          <strong>Excel · CSV 파일 선택</strong>
          <small>5MB 이하 · 정규화된 데이터 최대 2,000행</small>
          <input
            aria-label="Import 파일"
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              if (e.target.files?.[0]) read(e.target.files[0]);
            }}
          />
        </label>
        {sheets.length > 0 && (
          <>
            <Field
              label="시트 선택"
              name="tab"
              value={tab}
              onChange={(e: any) => setTab(Number(e.target.value))}
            >
              {sheets.map((s, i) => (
                <option value={i} key={i}>
                  {s.name}
                </option>
              ))}
            </Field>
            <Field
              label="헤더 행 번호"
              name="header"
              type="number"
              value={header}
              min={1}
              max={source.length}
              onChange={(e: any) => setHeader(Number(e.target.value))}
            />
            <SectionTitle title="열 매핑" />
            {cols.map((k) => (
              <Field
                label={k}
                name={k}
                key={k}
                value={mapping[k] || ""}
                onChange={(e: any) => {
                  setMapping((m) => ({ ...m, [k]: e.target.value }));
                  setPreview(null);
                  setConfirmed(false);
                }}
              >
                <option value="">열을 선택해주세요</option>
                {headers.filter(Boolean).map((h, i) => (
                  <option value={h} key={i}>
                    {h}
                  </option>
                ))}
              </Field>
            ))}
            <p className="micro">
              값 예: Boolean은 true/false, 날짜는 YYYY-MM-DD, 시간은 ISO
              8601(+09:00), answers는 JSON. 금액은 숫자. 빈 칸을 임의로
              입금완료·동의로 처리하지 않습니다.
            </p>
            <button
              className="button secondary full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setComplete(false);
                try {
                  if (boot.preview)
                    throw new Error(
                      "실제 Import 미리보기는 운영진 로그인과 DB 연결이 필요합니다.",
                    );
                  const rows = source
                    .slice(header)
                    .filter((r) => r.some((v) => String(v ?? "").trim()))
                    .map((row) =>
                      Object.fromEntries(
                        cols.map((k) => {
                          let value: any = row[headers.indexOf(mapping[k])];
                          if (
                            ["amount", "guest_fee"].includes(k) &&
                            value !== "" &&
                            value !== undefined
                          )
                            value = Number(value);
                          else if (
                            value === "" &&
                            ["birth_date", "actual"].includes(k)
                          )
                            value = null;
                          else value = coerceImportCell(value);
                          return [k, value];
                        }),
                      ),
                    );
                  const response = await fetch(
                    "/api/club/admin/import/preview",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ entity, rows }),
                    },
                  );
                  const result = await response.json();
                  if (response.status === 422) {
                    setPreview(result);
                    return;
                  }
                  if (!response.ok) throw new Error(result.error);
                  setPreview(result);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "분석 중…" : "미리보기 생성"}
            </button>
          </>
        )}
        {preview && (
          <>
            <Stats
              items={[
                {
                  label: "신규",
                  value: preview.new ?? preview.summary?.new ?? 0,
                },
                {
                  label: "기존 병합",
                  value: preview.merge ?? preview.summary?.merge ?? 0,
                },
                { label: "오류", value: preview.errors?.length ?? 0 },
              ]}
            />
            {preview.errors?.map((e: ClubRow, i: number) => (
              <p className="form-error" key={i}>
                {e.row}행 · {e.message}
              </p>
            ))}
            {preview.batch_id && !complete && (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    미리보기와 원본 백업을 확인했습니다. 실제 DB에 반영합니다.
                  </span>
                </label>
                <button
                  className="button primary full"
                  disabled={busy || !confirmed}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await mutate("admin/import/commit", {
                        batch_id: preview.batch_id,
                        digest: preview.digest,
                        confirmed: true,
                      });
                      setComplete(true);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Import 확정
                </button>
              </>
            )}
            {complete && (
              <div className="hint">
                <CheckCircle2 />
                Import가 완료되었습니다.
              </div>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
