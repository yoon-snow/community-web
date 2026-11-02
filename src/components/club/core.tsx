"use client";
import Link from "next/link";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Volleyball,
  X,
  AlertCircle,
} from "lucide-react";
import { type ClubRow } from "@/lib/domain";
import { previewResource } from "@/lib/preview";

export const Context = createContext<any>(null);

export function useApp() {
  return useContext(Context);
}

export async function api(path: string, options?: RequestInit) {
  const response = await fetch("/api/club/" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "데이터를 불러오지 못했습니다.");
  return result;
}

export function useResource(path: string | null) {
  const { boot, revision } = useApp();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path));
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    setData(null);
    (boot.preview ? Promise.resolve(previewResource(path, boot)) : api(path))
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, revision, boot.preview]);
  return { data, error, loading };
}

export function Loader() {
  return (
    <div aria-label="불러오는 중" role="status" className="skeletons">
      <div />
      <div />
      <div />
    </div>
  );
}

export function Empty({
  icon = Volleyball,
  title = "아직 등록된 내용이 없어요",
  children,
}: {
  icon?: any;
  title?: string;
  children?: ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="empty">
      <span>
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  const { refresh } = useApp();
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={20} />
      <div>
        {message}
        <button className="text-button" onClick={refresh}>
          다시 시도
        </button>
      </div>
    </div>
  );
}

export function Resource({
  resource,
  children,
}: {
  resource: ReturnType<typeof useResource>;
  children: (data: any) => ReactNode;
}) {
  return resource.loading ? (
    <Loader />
  ) : resource.error ? (
    <ErrorBox message={resource.error} />
  ) : resource.data ? (
    children(resource.data)
  ) : null;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Avatar({
  member,
  size = "",
}: {
  member: ClubRow;
  size?: string;
}) {
  return (
    <span className={`avatar ${size}`}>
      {member.avatar_url ? (
        <img src={member.avatar_url} alt={`${member.name} 프로필`} />
      ) : (
        member.name?.slice(0, 1) || "S"
      )}
    </span>
  );
}

export function SectionTitle({
  title,
  href,
  label = "전체 보기",
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  const { link } = useApp();
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {href && (
        <Link href={link(href)}>
          {label}
          <ChevronRight size={15} />
        </Link>
      )}
    </div>
  );
}

export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      className="sheet"
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="sheet-handle" />
      <div className="sheet-heading">
        <h2>{title}</h2>
        <button aria-label="닫기" className="icon-button" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function SaveForm({
  children,
  onSubmit,
  submit = "저장",
  className = "",
}: {
  children: ReactNode;
  onSubmit: (form: FormData) => Promise<void>;
  submit?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className={`form ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          await onSubmit(new FormData(e.currentTarget));
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? "처리 중…" : submit}
      </button>
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required = false,
  hint,
  value,
  children,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  hint?: string;
  value?: string | number;
  children?: ReactNode;
  [key: string]: any;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children ? (
        <select name={name} defaultValue={value} required={required} {...props}>
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={value}
          required={required}
          rows={4}
          {...props}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          {...props}
        />
      )}
      {hint && <small className="micro">{hint}</small>}
    </label>
  );
}

export function Chips({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="chips" role="group" aria-label="필터">
      {items.map((i) => (
        <button
          key={i.value}
          className={value === i.value ? "selected" : ""}
          aria-pressed={value === i.value}
          onClick={() => onChange(i.value)}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Stats({
  items,
}: {
  items: { label: string; value: ReactNode; sub?: string; tone?: string }[];
}) {
  return (
    <div className="stats">
      {items.map((i) => (
        <div className={`stat ${i.tone || ""}`} key={i.label}>
          <span>{i.label}</span>
          <strong>{i.value}</strong>
          {i.sub && <small>{i.sub}</small>}
        </div>
      ))}
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div>
        <h1>{title}</h1>
        {action}
      </div>
      {description && <p>{description}</p>}
    </div>
  );
}

export function ErrorBoxStandalone({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="empty" role="alert">
      <AlertCircle />
      <p>{message}</p>
      <button className="button secondary" onClick={retry}>
        다시 시도
      </button>
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img
          src="/branding/spotlight-symbol-transparent.png"
          alt=""
          width={44}
          height={44}
        />
      </span>
      <span>
        SPOT<span className="gold">LIGHT</span>
        <small>VOLLEYBALL CLUB</small>
      </span>
    </div>
  );
}

export function Back({ href, label }: { href: string; label: string }) {
  const { link } = useApp();
  return (
    <Link href={link(href)} className="back">
      <ArrowLeft size={18} />
      {label}
    </Link>
  );
}

export function Menu({
  items,
}: {
  items: { href: string; label: string; icon: any }[];
}) {
  const { link } = useApp();
  return (
    <div className="menu-list">
      {items.map(({ href, label, icon: Icon }) => (
        <Link href={link(href)} key={href}>
          <Icon size={20} />
          <span>{label}</span>
          <ChevronRight size={18} />
        </Link>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  total,
  size = 30,
  setPage,
}: {
  page: number;
  total: number;
  size?: number;
  setPage: (v: number) => void;
}) {
  return total > size ? (
    <div className="pagination">
      <button
        className="icon-button bordered"
        disabled={page === 0}
        aria-label="이전 페이지"
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft />
      </button>
      <span>
        {page + 1} / {Math.ceil(total / size)}
      </span>
      <button
        className="icon-button bordered"
        disabled={(page + 1) * size >= total}
        aria-label="다음 페이지"
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight />
      </button>
    </div>
  ) : null;
}

export function paymentLabel(status: string) {
  return (
    ({ paid: "납부완료", unpaid: "미납", exempt: "면제" } as any)[status] ||
    status
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 3000);
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
