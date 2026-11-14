"use client";
import { useState } from "react";
import { Field, SaveForm, useApp } from "./core";
import type { ClubRow } from "@/lib/domain";
export function ScheduleTools({ kinds }: { kinds: ClubRow[] }) {
  const { mutate, toast, boot } = useApp();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const active = kinds.filter((k) => !boot.archivedKinds?.includes(k.key));
  const item = active.find((k) => k.key === selected);
  return (
    <details className="card">
      <summary>정기운동 · 종류 관리</summary>
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
      <hr />
      <Field
        name="selected_kind"
        label="편집할 종류"
        value={selected}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          setSelected(e.target.value)
        }
      >
        <option value="">새 종류 추가</option>
        {active.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </Field>
      <SaveForm
        key={selected}
        submit="종류 저장"
        onSubmit={async (f) => {
          await mutate(
            "admin/schedule-kinds",
            { key: selected, label: f.get("label"), color: f.get("color") },
            selected ? "PATCH" : "POST",
          );
        }}
      >
        <Field
          name="label"
          label="종류 이름"
          required
          value={item?.label}
          maxLength={50}
        />
        <Field
          name="color"
          label="달력 표시 색상"
          type="color"
          value={item?.color || "#24477C"}
        />
      </SaveForm>
      {item && (
        <button
          type="button"
          className="button secondary full danger-text"
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                item.label +
                  " 종류를 삭제할까요? 기존 일정은 유지되며 새 일정에서는 선택할 수 없습니다.",
              )
            )
              return;
            setBusy(true);
            try {
              await mutate(
                "admin/schedule-kind-archive",
                { key: item.key },
                "DELETE",
              );
              setSelected("");
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "삭제 중…" : "선택한 종류 삭제"}
        </button>
      )}
    </details>
  );
}
