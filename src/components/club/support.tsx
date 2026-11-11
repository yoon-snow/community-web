"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ChevronRight,
  MessageCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { useApp, Loader } from "./core";
import demo from "@/lib/support-demo.json";
import { formatDate, formatTime } from "@/lib/domain";
type FAQ = (typeof demo.faqs)[number];
type Category = (typeof demo.categories)[number];
function forAudience(id: string, audience: string) {
  if (audience === "member") return !["guest", "payment", "join"].includes(id);
  if (audience === "guest")
    return !["dues", "attendance", "video", "uniform"].includes(id);
  return true;
}
type Ticket = {
  id: string;
  title: string;
  name: string;
  status: string;
  category_id: string;
  member_id: string | null;
  updated_at: string;
  last_reply_at: string | null;
  created_at: string;
  faq_question?: string;
  faq_answer?: string;
  phone?: string;
  event_id?: string;
  guest_application_id?: string;
  guest_id?: string;
};
type Message = {
  id: string;
  body: string;
  sender: string;
  created_at: string;
  images: string[];
};
const states: Record<string, string> = {
  NEW: "새 문의",
  IN_PROGRESS: "확인중",
  RESOLVED: "답변완료",
};
const demoId = "00000000-0000-4000-8000-000000000099";
const stamp = (v: string) => formatDate(v) + " " + formatTime(v);
function demoResult(path: string) {
  const ticket: Ticket = {
    id: demoId,
    title: "입금 확인 부탁드려요",
    name: "예시 회원",
    category_id: "payment",
    member_id: "demo",
    status: "NEW",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_reply_at: null,
  };
  if (path === "catalog" || path === "admin/faqs") return demo;
  if (
    path.startsWith("admin/inbox") &&
    new URLSearchParams(path.split("?")[1]).get("role") === "guest"
  )
    return {
      rows: [{ ...ticket, member_id: null, name: "예시 게스트" }],
      counts: [1, 0, 1],
      total: 1,
    };
  if (path.startsWith("mine") || path.startsWith("admin/inbox"))
    return { rows: [ticket], counts: [1, 0, 1], total: 1 };
  return {
    ticket,
    messages: [
      {
        id: "demo",
        body: "어제 신청한 운동의 입금 상태가 궁금해요.",
        sender: "member",
        created_at: ticket.created_at,
        images: [],
      },
    ],
    payment: null,
  };
}
function secret() {
  return new URLSearchParams(location.hash.slice(1)).get("key") || "";
}
async function request(path: string, body?: FormData | object) {
  const key = secret();
  const headers: Record<string, string> = {};
  if (key) headers["x-inquiry-token"] = key;
  const form = body instanceof FormData;
  if (body && !form) headers["Content-Type"] = "application/json";
  const r = await fetch("/api/support/" + path, {
    cache: "no-store",
    method: body ? "POST" : "GET",
    headers,
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "잠시 후 다시 시도해주세요.");
  return result;
}
export function useSupport(path: string) {
  const { boot, revision } = useApp();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    path: string;
    data?: any;
    error?: string;
  }>({ path: "" });
  useEffect(() => {
    let alive = true;
    const fetcher = boot.preview
      ? Promise.resolve(demoResult(path))
      : request(path);
    fetcher
      .then((data) => {
        if (alive) setState({ path, data });
      })
      .catch((e) => {
        if (alive) setState({ path, error: e.message });
      });
    return () => {
      alive = false;
    };
  }, [path, boot.preview, revision, version]);
  return {
    ...(state.path === path ? state : {}),
    reload: () => setVersion((v) => v + 1),
  };
}
function Feedback({ error }: { error?: string }) {
  return error ? (
    <p className="error-box" role="alert">
      {error}
    </p>
  ) : null;
}
function Status({ value }: { value: string }) {
  return <span className={"support-status " + value}>{states[value]}</span>;
}
export function SupportHome() {
  const { boot, link } = useApp(),
    params = useSearchParams();
  const { data, error, reload } = useSupport("catalog");
  const [category, setCategory] = useState(params.get("category") || ""),
    [query, setQuery] = useState(""),
    [selected, choose] = useState<FAQ | null>(null),
    [compose, setCompose] = useState(false),
    [resolved, setResolved] = useState(false);
  const focused = params.get("faq");
  const audience = boot.member ? "member" : "guest";
  useEffect(() => {
    const f = data?.faqs.find((row: FAQ) => row.id === focused);
    if (f && forAudience(f.category_id, audience)) {
      choose(f);
      setCategory(f.category_id);
      if (!boot.preview) void request("view", { id: f.id }).catch(() => {});
    }
  }, [data, focused, boot.preview, audience]);
  if (!data)
    return error ? (
      <>
        <Feedback error={error} />
        <button onClick={reload}>다시 시도</button>
      </>
    ) : (
      <Loader />
    );
  const cats: Category[] = data.categories.filter((c: Category) =>
      forAudience(c.id, audience),
    ),
    faqs: FAQ[] = data.faqs.filter((f: FAQ) =>
      forAudience(f.category_id, audience),
    );
  const name = (id: string) => cats.find((c) => c.id === id)?.name || id;
  const list = faqs
    .filter(
      (f) =>
        (!category || category === f.category_id) &&
        [f.question, f.answer, name(f.category_id), ...f.keywords]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.is_featured) - Number(a.is_featured) ||
        (audience === "member"
          ? Number(
              ["attendance", "dues", "uniform", "video"].includes(
                b.category_id,
              ),
            ) -
            Number(
              ["attendance", "dues", "uniform", "video"].includes(
                a.category_id,
              ),
            )
          : 0) ||
        b.view_count - a.view_count ||
        a.sort_order - b.sort_order,
    );
  function open(f: FAQ) {
    choose(f);
    setCompose(false);
    setResolved(false);
    if (!boot.preview) void request("view", { id: f.id }).catch(() => {});
  }
  if (compose)
    return (
      <Compose
        faq={selected}
        category={selected?.category_id || category || "other"}
        cats={cats}
        close={() => setCompose(false)}
      />
    );
  return (
    <div className="support">
      <header className="support-intro">
        <MessageCircle aria-hidden="true" />
        <h1>무엇을 도와드릴까요?</h1>
        <p>궁금한 내용을 먼저 확인해보세요.</p>
      </header>
      <label className="support-search">
        <Search size={19} />
        <input
          type="search"
          aria-label="FAQ 검색"
          placeholder="궁금한 내용을 검색해주세요"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCategory("");
            choose(null);
            setResolved(false);
          }}
        />
      </label>
      <div className="chips" aria-label="문의 카테고리">
        {[{ id: "", name: "전체", icon: "" }, ...cats].map((c) => (
          <button
            className={category === c.id ? "chip active" : "chip"}
            aria-pressed={category === c.id}
            key={c.id}
            onClick={() => {
              setCategory(c.id);
              choose(null);
              setResolved(false);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <section className="card">
        <h2>
          {query ? "검색 결과" : category ? name(category) : "자주 묻는 질문"}
        </h2>
        {!list.length && <p>일치하는 질문이 없습니다.</p>}
        {(query || category ? list : list.slice(0, 5)).map((f) => (
          <div key={f.id}>
            <button
              className="support-question"
              aria-expanded={selected?.id === f.id}
              onClick={() => (selected?.id === f.id ? choose(null) : open(f))}
            >
              {f.question}
              <ChevronRight size={18} />
            </button>
            {selected?.id === f.id && (
              <div className="support-answer">
                <p>{f.answer}</p>
                {resolved ? (
                  <p role="status">
                    <CheckCircle2 size={16} /> 해결됐어요
                  </p>
                ) : (
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => setResolved(true)}
                    >
                      해결됐어요
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setCompose(true)}
                    >
                      추가 문의하기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
      {!selected && (
        <button
          className="button secondary full"
          onClick={() => {
            choose(null);
            setCompose(true);
          }}
        >
          찾는 답변이 없어요 · 운영진 문의
        </button>
      )}
      {boot.member && (
        <Link className="button secondary full" href={link("/support/mine")}>
          내 문의
        </Link>
      )}
    </div>
  );
}
type Receipt = {
  id: string;
  proof: string;
  name: string;
  phone: string;
  event: string;
};
function recentApplication(): Receipt | null {
  try {
    return JSON.parse(
      sessionStorage.getItem("spot-support-application") || "null",
    );
  } catch {
    return null;
  }
}
function Images({ max = 3 }: { max?: number }) {
  return max > 0 ? (
    <label>
      사진 첨부 <small>선택 · 최대 {max}장, 장당 1MB</small>
      <input
        type="file"
        name="image"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.setCustomValidity(
            files.length > max || files.some((f) => f.size > 1048576)
              ? "사진 장수와 용량을 확인해주세요."
              : "",
          );
          e.target.reportValidity();
        }}
      />
    </label>
  ) : null;
}
function cleanForm(form: HTMLFormElement) {
  const d = new FormData(form);
  const files = d.getAll("image");
  d.delete("image");
  for (const f of files)
    if (typeof f !== "string" && f.size) d.append("image", f);
  return d;
}
function Compose({
  faq,
  category,
  cats,
  close,
}: {
  faq: FAQ | null;
  category: string;
  cats: Category[];
  close: () => void;
}) {
  const { boot, link } = useApp(),
    router = useRouter();
  const [app] = useState(() =>
    boot.member || boot.preview ? null : recentApplication(),
  );
  const [event, setEvent] = useState(app?.event || "");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (boot.preview) {
      setError("미리보기에서는 문의를 접수하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const d = cleanForm(e.currentTarget);
      if (faq) {
        d.set("faq", faq.id);
        d.set("category", faq.category_id);
      }
      if (app && event === app.event) {
        d.set("receipt", app.id);
        d.set("proof", app.proof);
      }
      const r = await request("create", d);
      router.replace(
        link("/support/" + r.id) + (r.token ? "#key=" + r.token : ""),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="support">
      <button className="support-back" onClick={close}>
        <ArrowLeft size={16} /> 자주 묻는 질문
      </button>
      <h1>운영진 문의</h1>
      <form className="card support-form" onSubmit={submit}>
        {faq ? (
          <div className="support-answer">
            <small>
              {cats.find((c) => c.id === category)?.name} · 확인한 FAQ
            </small>
            <p>{faq.question}</p>
            <input type="hidden" name="title" value={faq.question} />
          </div>
        ) : (
          <>
            <label>
              문의 카테고리
              <select name="category" defaultValue={category}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제목
              <input name="title" required maxLength={150} />
            </label>
          </>
        )}
        {!boot.member && (
          <>
            <label>
              이름
              <input
                name="name"
                defaultValue={app?.name}
                required
                maxLength={80}
              />
            </label>
            <label>
              연락처
              <input
                name="phone"
                type="tel"
                defaultValue={app?.phone}
                required
              />
            </label>
          </>
        )}
        <label>
          관련 운동 (선택)
          <select
            name="event"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {app && !boot.events.some((x: any) => x.id === app.event) && (
              <option value={app.event}>신청한 운동</option>
            )}
            {boot.events.map((x: any) => (
              <option key={x.id} value={x.id}>
                {formatDate(x.starts_at)} · {x.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {faq ? "추가 질문" : "문의 내용"}
          <textarea name="body" required maxLength={4000} rows={5} />
        </label>
        <Images />
        <Feedback error={error} />
        <button className="button primary" disabled={busy}>
          {busy ? "접수 중…" : "문의 보내기"}
        </button>
      </form>
    </div>
  );
}
export function Inbox({ admin = false }: { admin?: boolean }) {
  const { link } = useApp();
  const scope = useSearchParams().get("scope") || "";
  const [status, setStatus] = useState(""),
    [role, setRole] = useState(
      ["guest", "member"].includes(scope) ? scope : "",
    ),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(0);
  const cat = useSupport("catalog"),
    { data, error } = useSupport(
      (admin ? "admin/inbox" : "mine") +
        "?" +
        new URLSearchParams({ status, role, category, page: String(page) }),
    );
  const cats: Category[] = cat.data?.categories || [];
  return (
    <div className="support">
      <h1>{admin ? "문의 관리" : "내 문의"}</h1>
      {admin && (
        <>
          <Link
            href={link("/admin/support/faqs" + (role ? "?scope=" + role : ""))}
            className="button secondary"
          >
            FAQ 관리
          </Link>
          <section className="support-stats">
            {["새 문의", "확인중", "오늘 문의"].map((n, i) => (
              <div key={n}>
                <strong>{data?.counts[i] ?? "–"}</strong>
                <small>{n}</small>
              </div>
            ))}
          </section>
          <div className="chips">
            {Object.entries({ "": "전체", ...states }).map(([k, v]) => (
              <button
                className={status === k ? "chip active" : "chip"}
                key={k}
                onClick={() => {
                  setStatus(k);
                  setPage(0);
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="button-row">
            <select
              aria-label="문의자"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(0);
              }}
            >
              <option value="">모든 문의자</option>
              <option value="guest">게스트</option>
              <option value="member">회원</option>
            </select>
            <select
              aria-label="카테고리"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <option value="">모든 카테고리</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <Feedback error={error} />
      {!data && !error && <Loader />}
      {data?.rows.map((t: Ticket) => (
        <Link
          className="card support-ticket"
          key={t.id}
          href={link((admin ? "/admin" : "") + "/support/" + t.id)}
        >
          <Status value={t.status} />
          <strong>{t.title}</strong>
          <small>
            {cats.find((c) => c.id === t.category_id)?.name} ·{" "}
            {t.member_id ? "회원" : "게스트"}
            {admin && " · " + t.name}
          </small>
          <small>
            {t.last_reply_at
              ? "최근 답변 " + stamp(t.last_reply_at)
              : "접수 " + stamp(t.created_at)}
          </small>
        </Link>
      ))}
      {data && !data.rows.length && (
        <p className="card">표시할 문의가 없습니다.</p>
      )}
      <div className="button-row">
        {page > 0 && <button onClick={() => setPage(page - 1)}>이전</button>}
        {data?.total > (page + 1) * 30 && (
          <button onClick={() => setPage(page + 1)}>다음</button>
        )}
      </div>
      {!admin && (
        <Link href={link("/support")} className="button secondary">
          문의하기
        </Link>
      )}
    </div>
  );
}
export function Thread({ id, admin }: { id: string; admin: boolean }) {
  const { boot, link, mutate } = useApp(),
    path = (admin ? "admin/" : "") + id;
  const { data, error, reload } = useSupport(path),
    catalog = useSupport("catalog");
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    [copy, setCopy] = useState(false);
  async function action(cb: () => Promise<any>) {
    if (busy) return;
    setMsg("");
    if (boot.preview) {
      setMsg("미리보기에서는 저장하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      await cb();
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return error ? <Feedback error={error} /> : <Loader />;
  const t: Ticket = data.ticket,
    messages: Message[] = data.messages,
    category = catalog.data?.categories.find(
      (c: Category) => c.id === t.category_id,
    )?.name;
  return (
    <div className="support">
      <Link
        className="support-back"
        href={link(
          admin ? "/admin/support" : boot.member ? "/support/mine" : "/support",
        )}
      >
        ← {admin ? "문의 관리" : boot.member ? "내 문의" : "문의센터"}
      </Link>
      <section className="card">
        <Status value={t.status} />
        <h1>{t.title}</h1>
        <p>
          {category} · {t.name} · {stamp(t.created_at)}
        </p>
        {t.faq_question && (
          <details>
            <summary>이미 확인한 FAQ · {t.faq_question}</summary>
            <p>{t.faq_answer}</p>
          </details>
        )}
      </section>
      {!admin && !t.member_id && (
        <div className="support-answer">
          <strong>내 문의 전용 링크</strong>
          <p>
            이 링크를 저장해두면 로그인 없이 답변을 볼 수 있어요. 링크를 가진
            사람이 문의를 열 수 있습니다.
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href);
                setMsg("링크를 복사했습니다.");
              } catch {
                setCopy(true);
              }
            }}
          >
            전용 링크 복사
          </button>
          {copy && (
            <input
              readOnly
              value={location.href}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      )}
      {admin && (
        <section className="card support-form">
          <label>
            처리 상태
            <select
              value={t.status}
              disabled={busy}
              onChange={(e) =>
                void action(() =>
                  request(path + "/status", { status: e.target.value }),
                )
              }
            >
              {Object.entries(states).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p>
            {t.member_id ? "회원" : "게스트"} · {t.name} · {t.phone}
          </p>
          {t.member_id && (
            <div className="button-row">
              {[
                ["회원 정보", "/admin/members?member="],
                ["출석", "/admin/attendance?view=records&member="],
                ["회비", "/admin/dues?member="],
              ].map(([label, url]) => (
                <Link key={label} href={link(url + t.member_id)}>
                  {label}
                </Link>
              ))}
            </div>
          )}
          {t.guest_application_id && (
            <Link
              href={link("/admin/guests?application=" + t.guest_application_id)}
            >
              게스트 정보 및 신청서
            </Link>
          )}
          {t.event_id && (
            <Link href={link("/admin/events/" + t.event_id)}>관련 운동</Link>
          )}
          {data.payment && (
            <div>
              <strong>
                {data.payment.amount.toLocaleString()}원 ·{" "}
                {data.payment.status === "paid" ? "입금완료" : "입금확인 전"}
              </strong>
              {data.payment.status !== "paid" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("실제 입금 내역을 확인하셨나요?"))
                      void action(() =>
                        mutate("admin/payments/confirm", {
                          application_id: t.guest_application_id,
                        }),
                      );
                  }}
                >
                  입금완료 처리
                </button>
              )}
            </div>
          )}
        </section>
      )}
      <h2>문의 대화</h2>
      {messages.map((m) => (
        <article
          className={"support-message " + (m.sender === "admin" ? "staff" : "")}
          key={m.id}
        >
          <strong>{m.sender === "admin" ? "운영진" : t.name}</strong>
          <p>{m.body}</p>
          {m.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="문의 첨부 사진" />
            </a>
          ))}
          <small>{stamp(m.created_at)}</small>
        </article>
      ))}
      <form
        className="card support-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = cleanForm(form);
          void action(async () => {
            await request(path + "/reply", d);
            form.reset();
          });
        }}
      >
        <label>
          {admin ? "운영진 답변" : "추가 메시지"}
          <textarea required name="body" maxLength={4000} rows={3} />
        </label>
        <Images max={3 - messages.reduce((n, m) => n + m.images.length, 0)} />
        <button className="button primary" disabled={busy}>
          메시지 보내기
        </button>
      </form>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
export function FaqEditor() {
  const scope = useSearchParams().get("scope") || "";
  const { boot } = useApp(),
    { data, error, reload } = useSupport("admin/faqs");
  const [edit, set] = useState<Partial<FAQ> | null>(null),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  if (!data) return error ? <Feedback error={error} /> : <Loader />;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (boot.preview) {
      setMsg("미리보기에서는 저장하지 않습니다.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setMsg("");
    const d = new FormData(e.currentTarget);
    try {
      await request("admin/faqs", {
        id: edit?.id,
        category_id: d.get("category"),
        question: d.get("question"),
        answer: d.get("answer"),
        keywords: String(d.get("keywords"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        sort_order: Number(d.get("order")),
        is_featured: d.has("featured"),
        is_active: d.has("active"),
      });
      set(null);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="support">
      <h1>FAQ 관리</h1>
      {msg && <p role="status">{msg}</p>}
      {edit ? (
        <form
          className="card support-form"
          key={edit.id || "new"}
          onSubmit={save}
        >
          <label>
            카테고리
            <select name="category" defaultValue={edit.category_id}>
              {data.categories
                .filter((c: Category) => forAudience(c.id, scope))
                .map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            질문
            <input
              name="question"
              required
              maxLength={180}
              defaultValue={edit.question}
            />
          </label>
          <label>
            자동 답변
            <textarea
              name="answer"
              required
              rows={5}
              maxLength={4000}
              defaultValue={edit.answer}
            />
          </label>
          <label>
            검색 키워드 (쉼표로 구분)
            <input name="keywords" defaultValue={edit.keywords?.join(", ")} />
          </label>
          <label>
            표시 순서
            <input
              type="number"
              min="0"
              max="99999"
              name="order"
              defaultValue={edit.sort_order ?? 0}
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="featured"
              defaultChecked={edit.is_featured}
            />{" "}
            중요 FAQ 고정
          </label>
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={edit.is_active ?? true}
            />{" "}
            공개
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => set(null)}
            >
              취소
            </button>
            <button disabled={busy} className="button primary">
              저장
            </button>
          </div>
        </form>
      ) : (
        <>
          <button className="button primary" onClick={() => set({})}>
            FAQ 추가
          </button>
          <section className="card">
            {data.faqs
              .filter((f: FAQ) => forAudience(f.category_id, scope))
              .map((f: FAQ) => (
                <button
                  className="support-question"
                  key={f.id}
                  onClick={() => set(f)}
                >
                  {f.question}
                  <small>
                    {f.is_featured ? "고정 · " : ""}
                    {f.is_active ? "공개" : "비공개"} · 조회 {f.view_count}
                  </small>
                </button>
              ))}
          </section>
        </>
      )}
    </div>
  );
}

export function ContextFaqs({ category }: { category: string }) {
  const { link } = useApp(),
    { data } = useSupport("catalog");
  const { boot } = useApp();
  const list: FAQ[] = (data?.faqs || []).filter((f: FAQ) =>
    forAudience(f.category_id, boot.member ? "member" : "guest"),
  );
  const relevant = list.filter((f) => f.category_id === category);
  if (category === "payment") {
    const cancel = list.find(
      (f) => f.category_id === "guest" && f.keywords.includes("취소"),
    );
    if (cancel) relevant.push(cancel);
  }
  return (
    <>
      {relevant.map((f) => (
        <Link
          key={f.id}
          href={link("/support?category=" + f.category_id + "&faq=" + f.id)}
        >
          {f.question}
          <ChevronRight size={16} />
        </Link>
      ))}
    </>
  );
}
