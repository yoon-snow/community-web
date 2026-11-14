"use client";
import { useState } from "react";
import { Field, SaveForm, useApp } from "./core";
import type { ClubRow } from "@/lib/domain";

export function ScheduleTools({ kinds }: { kinds: ClubRow[] }) {
  const { mutate, toast, boot } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = kinds.filter(
    (kind) => !boot.archivedKinds?.includes(kind.key),
  );

  const editor = (kind?: ClubRow) => (
    <SaveForm
      key={kind?.key || "new"}
      submit="종류 저장"
      onSubmit={async (form) => {
        await mutate(
          "admin/schedule-kinds",
          {
            key: kind?.key || "",
            label: form.get("label"),
            color: form.get("color"),
          },
          kind ? "PATCH" : "POST",
        );
        setEditing(null);
      }}
    >
      <Field
        name="label"
        label="종류 이름"
        value={kind?.label}
        required
        maxLength={50}
      />
      <Field
        name="color"
        type="color"
        label="달력 표시 색상"
        value={kind?.color || "#24477c"}
      />
      <button
        type="button"
        className="text-button"
        onClick={() => setEditing(null)}
      >
        취소
      </button>
    </SaveForm>
  );

  return (
    <>
      <section id="kind-settings" className="form" aria-label="일정 종류 관리">
        <h3>일정 종류 관리</h3>
        {active.map((kind) => (
          <div key={kind.key} className="card form">
            <strong>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: kind.color,
                  marginInlineEnd: 8,
                }}
              />
              {kind.label}
            </strong>
            {editing === kind.key ? (
              editor(kind)
            ) : removing === kind.key ? (
              <>
                <p>
                  ‘{kind.label}’을 종류 목록에서 삭제할까요? 이미 등록한 일정은
                  유지됩니다.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="button secondary danger-text"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await mutate(
                          "admin/schedule-kind-archive",
                          { key: kind.key },
                          "DELETE",
                        );
                        setRemoving(null);
                      } catch (error) {
                        toast((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    삭제 확정
                  </button>
                </div>
              </>
            ) : (
              <div className="button-row">
                <button
                  type="button"
                  className="button secondary"
                  aria-label={kind.label + " 이름·색상 변경"}
                  onClick={() => {
                    setEditing(kind.key);
                    setRemoving(null);
                  }}
                >
                  이름·색상 변경
                </button>
                <button
                  type="button"
                  className="button secondary danger-text"
                  aria-label={kind.label + " 삭제"}
                  onClick={() => {
                    setRemoving(kind.key);
                    setEditing(null);
                  }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
        {editing === "" ? (
          editor()
        ) : (
          <button
            className="button secondary"
            onClick={() => {
              setEditing("");
              setRemoving(null);
            }}
          >
            새 종류 추가
          </button>
        )}
      </section>
      <details className="card">
        <summary>정기운동 관리</summary>
        <p>
          광명동초등학교 · 화·목·일 게임데이 5,000원 / 월·금 레슨데이 15,000원
        </p>
        <p className="micro">
          평일 18–21시 · 일요일 17–20시. 이미 등록한 운동은 건너뜁니다.
        </p>
        <SaveForm
          submit="앞으로 8주 정기운동 채우기"
          onSubmit={async () => {
            const result = await mutate("admin/regular-schedule", {});
            toast(`${result.added}개 일정을 추가했습니다.`);
          }}
        >
          {null}
        </SaveForm>
      </details>
    </>
  );
}
