"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className="initial-loading">
      <h1>화면을 불러오지 못했어요.</h1>
      <p>잠시 후 다시 시도해주세요.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
