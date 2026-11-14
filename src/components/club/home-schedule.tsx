"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, Plus } from "lucide-react";
import { eventKinds, formatDate, type ClubEvent } from "@/lib/domain";
import { Field, Loader, Resource, useApp, useResource } from "./core";
import { ScheduleTools } from "./schedule-tools";

const EventEditor = dynamic(
  () => import("./admin-forms").then((m) => m.EventEditor),
  { loading: Loader },
);

function EditHomeEvent({ id, close }: { id: string; close: () => void }) {
  const detail = useResource("events/" + id);
  return (
    <Resource resource={detail}>
      {(data) => <EventEditor event={data.event} close={close} />}
    </Resource>
  );
}

export function HomeSchedule({ current }: { current?: ClubEvent }) {
  const { boot } = useApp();
  const [selection, setSelection] = useState("");
  const [editor, setEditor] = useState("");
  const events = new Map<string, ClubEvent>();
  if (current) events.set(current.id, current);
  for (const event of boot.events as ClubEvent[])
    if (event.status !== "deleted") events.set(event.id, event);
  const chosen = events.has(selection)
    ? selection
    : events.keys().next().value || "";
  const kinds =
    boot.scheduleKinds ||
    Object.entries(eventKinds).map(([key, label]) => ({ key, label }));
  return (
    <>
      <section className="card form" aria-label="일정 관리">
        <h2 style={{ margin: 0 }}>
          <CalendarDays size={18} /> 일정 관리
        </h2>
        <button className="button primary" onClick={() => setEditor("new")}>
          <Plus size={16} /> 일정 추가
        </button>
        {chosen && (
          <>
            <Field
              label="수정할 일정"
              name="home_schedule"
              value={chosen}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelection(e.target.value)
              }
            >
              {Array.from(events.values())
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                .map((event) => (
                  <option key={event.id} value={event.id}>
                    {formatDate(event.starts_at)} · {event.title}
                  </option>
                ))}
            </Field>
            <button
              className="button secondary"
              onClick={() => setEditor(chosen)}
            >
              선택한 일정 수정
            </button>
          </>
        )}
        <ScheduleTools kinds={kinds} />
      </section>
      {editor === "new" ? (
        <EventEditor close={() => setEditor("")} />
      ) : (
        editor && <EditHomeEvent id={editor} close={() => setEditor("")} />
      )}
    </>
  );
}
