"use client";
import { useState } from "react";
import { Field, parseCsv, useApp, useResource } from "./core";
const labels = {
  form: "폼",
  guide: "안내문구",
  instagram: "인스타그램",
  sheet: "시트",
};
type Source = {
  category: keyof typeof labels;
  title: string;
  content: string;
  url: string;
};
export function SourceImport() {
  const { mutate, boot } = useApp();
  const [rows, setRows] = useState<Source[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const stored = useResource(boot.preview ? null : "admin/sources");
  async function read(file: File) {
    setRows([]);
    setError("");
    setBusy(true);
    try {
      if (file.size > 1024 * 1024) throw Error("1MB 이하 파일을 선택해주세요.");
      const grid = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
      const head = grid.shift() || [];
      if (
        !["category", "title", "content", "url"].every((k) => head.includes(k))
      )
        throw Error("양식의 열 이름을 확인해주세요.");
      const seen = new Set<string>();
      const next = grid
        .filter((r) => r.some((v) => v.trim()))
        .map((r, i) => {
          const get = (key: string) => (r[head.indexOf(key)] || "").trim();
          const category = get("category") as Source["category"],
            title = get("title"),
            content = get("content"),
            url = get("url");
          if (
            !Object.hasOwn(labels, category) ||
            !title ||
            title.length > 150 ||
            content.length > 20000 ||
            (!content && !url) ||
            (url && (!URL.canParse(url) || new URL(url).protocol !== "https:"))
          )
            throw Error(
              `${i + 2}행의 종류·제목·내용·HTTPS 주소를 확인해주세요.`,
            );
          const id = category + "|" + title;
          if (seen.has(id))
            throw Error(`${i + 2}행의 종류와 제목이 중복됩니다.`);
          seen.add(id);
          return { category, title, content, url };
        });
      if (!next.length || next.length > 100)
        throw Error("1~100개 자료로 나눠주세요.");
      setRows(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>폼 · 안내문구 · 인스타 · 시트</h2>
      <p>
        자료의 본문과 원본 주소를 운영진 자료함에 보관합니다. 같은 종류와 제목은
        기존 자료를 갱신합니다.
      </p>
      <a
        className="button secondary"
        href="/templates/club-sources.csv"
        download
      >
        자료 입력 양식 CSV
      </a>
      <Field
        label="자료 CSV 미리보기"
        name="source_file"
        type="file"
        accept=".csv"
        disabled={busy}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
          e.target.value = "";
        }}
      />
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <article className="source-review" key={r.category + r.title}>
          <small>{labels[r.category]}</small>
          <h3>{r.title}</h3>
          <p>{r.content}</p>
          <span>{r.url}</span>
        </article>
      ))}
      {!!rows.length && (
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await mutate("admin/sources", { rows });
              setRows([]);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {rows.length}개 자료 가져오기 확정
        </button>
      )}
      <details>
        <summary>저장한 운영 자료</summary>
        {stored.error && <p role="alert">{stored.error}</p>}
        {stored.data?.map((r: Source) => (
          <article className="source-review" key={r.category + r.title}>
            <small>{labels[r.category]}</small>
            <h3>{r.title}</h3>
            <p>{r.content}</p>
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer">
                원본 열기
              </a>
            )}
          </article>
        ))}
      </details>
    </section>
  );
}
