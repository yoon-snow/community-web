"use client";

import { useState } from "react";

import {
  eventKinds,
  videoCategories,
  parseYouTube,
  formatDate,
  formatTime,
  seoulDate,
  type ClubRow,
  type ClubEvent,
} from "@/lib/domain";

import {
  useApp,
  api,
  Modal,
  SaveForm,
  Field,
  useResource,
  Resource,
} from "./core";

export function EventEditor({
  event,
  day = seoulDate(),
  close,
}: {
  event?: ClubRow;
  day?: string;
  close: () => void;
}) {
  const { mutate, boot } = useApp();
  const kinds: ClubRow[] =
    boot.scheduleKinds ||
    Object.entries(eventKinds).map(([key, label]) => ({ key, label }));
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const regularKind = [1, 5].includes(weekday) ? "lesson" : "game";
  const labelFor = (key: string) =>
    kinds.find((k) => k.key === key)?.label || key;
  const defaultStart = day + "T" + (weekday === 0 ? "17:00" : "18:00");
  const defaultEnd = day + "T" + (weekday === 0 ? "20:00" : "21:00");

  const [urgent, setUrgent] = useState(Boolean(event?.is_emergency));
  const local = (s: string) => {
    const date = new Date(s);
    return `${seoulDate(date)}T${formatTime(s)}`;
  };
  return (
    <Modal title={event ? "운동 일정 수정" : "새 운동 일정"} close={close}>
      <SaveForm
        onSubmit={async (f) => {
          const start = String(f.get("starts_at"));
          const end = String(f.get("ends_at"));
          let reason = String(f.get("change_reason") || "").trim();
          if (
            event &&
            (local(event.starts_at) !== start || local(event.ends_at) !== end)
          ) {
            const range = (a: string, b: string) =>
              a.replace("T", " ") +
              "–" +
              (a.slice(0, 10) === b.slice(0, 10)
                ? b.slice(11)
                : b.replace("T", " "));
            const change =
              "기존 " +
              range(local(event.starts_at), local(event.ends_at)) +
              " → 변경 " +
              range(start, end);
            reason = [
              change,
              reason.replace(/^기존 \d{4}-[^\n]+ → 변경 [^\n]+(?:\n|$)/, ""),
            ]
              .filter(Boolean)
              .join("\n");
          }
          await mutate(
            "admin/events",
            {
              ...(event ? { id: event.id } : {}),
              title: f.get("title"),
              starts_at: new Date(`${f.get("starts_at")}+09:00`).toISOString(),
              ends_at: new Date(`${f.get("ends_at")}+09:00`).toISOString(),
              location: f.get("location"),
              kind: f.get("kind"),
              description: f.get("description"),
              guests_open: f.has("guests_open"),
              is_emergency: urgent,
              change_reason: reason,
              guest_fee: Number(f.get("guest_fee")),
              status: f.get("status") || "scheduled",
            },
            event ? "PATCH" : "POST",
          );
          close();
        }}
      >
        <Field
          label="일정 이름"
          name="title"
          value={event?.title ?? labelFor(regularKind)}
          required
          maxLength={150}
        />
        <Field
          label="시작 · 한국 시간"
          name="starts_at"
          type="datetime-local"
          value={event ? local(event.starts_at) : defaultStart}
          required
        />
        <Field
          label="종료 · 한국 시간"
          name="ends_at"
          type="datetime-local"
          value={event ? local(event.ends_at) : defaultEnd}
          required
        />
        <Field
          label="장소"
          name="location"
          value={event?.location ?? "광명동초등학교"}
          required
        />
        <Field
          label="종류"
          name="kind"
          value={event?.kind ?? regularKind}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            if (event) return;
            const form = e.currentTarget.form,
              key = e.currentTarget.value;
            if (!form) return;
            const title = form.elements.namedItem("title") as HTMLInputElement;
            if (kinds.some((k) => k.label === title.value) || !title.value)
              title.value = labelFor(key);
            if (key === "game" || key === "lesson")
              (form.elements.namedItem("guest_fee") as HTMLInputElement).value =
                key === "game" ? "5000" : "15000";
          }}
        >
          {kinds.map((k) => (
            <option value={k.key} key={k.key}>
              {k.label}
            </option>
          ))}
        </Field>
        <Field
          label="설명"
          name="description"
          type="textarea"
          value={event?.description}
        />
        <Field
          label="게스트비"
          name="guest_fee"
          type="number"
          value={event?.guest_fee ?? (regularKind === "lesson" ? 15000 : 5000)}
          min={0}
          required
        />
        <label className="checkbox">
          <input
            type="checkbox"
            name="guests_open"
            defaultChecked={event?.guests_open ?? true}
          />
          <span>게스트 신청 허용</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => setUrgent(e.target.checked)}
          />
          <span>긴급 변경 · 캘린더에 빨간색으로 표시</span>
        </label>
        {(urgent || event) && (
          <Field
            label={urgent ? "긴급 변경 안내" : "일정 변경 안내"}
            name="change_reason"
            value={event?.change_reason}
            type="textarea"
            required={urgent}
            placeholder="체육관 또는 시간 변경 내용을 입력해주세요."
          />
        )}
        {event && (
          <Field
            label="상태"
            name="status"
            value={event?.status || "scheduled"}
          >
            {[
              { value: "scheduled", label: "진행 전" },
              { value: "completed", label: "완료" },
              { value: "cancelled", label: "취소" },
            ].map((i) => (
              <option value={i.value} key={i.value}>
                {i.label}
              </option>
            ))}
          </Field>
        )}
      </SaveForm>
      {event && <DeleteButton resource="events" id={event.id} done={close} />}
    </Modal>
  );
}

export function DeleteButton({
  resource,
  id,
  done,
}: {
  resource: string;
  id: string;
  done: () => void;
}) {
  const { mutate, toast } = useApp();
  return (
    <button
      className="text-button danger-text"
      onClick={async () => {
        if (
          !window.confirm(
            "삭제하시겠습니까? 일정과 공지는 기존 기록 보존을 위해 숨김 처리됩니다.",
          )
        )
          return;
        try {
          await mutate("admin/delete", { resource, id });
          done();
        } catch (e) {
          toast((e as Error).message);
        }
      }}
    >
      삭제하기
    </button>
  );
}

export function NoticeEditor({
  notice: n,
  defaultAudience = "public",
  close,
}: {
  notice?: ClubRow;
  defaultAudience?: string;
  close: () => void;
}) {
  const { mutate } = useApp();
  const history = useResource(n ? `admin/notices/${n.id}/versions` : null);
  return (
    <Modal title={n ? "공지 수정" : "새 공지"} close={close}>
      <SaveForm
        submit={n ? "수정 저장" : "게시하기"}
        onSubmit={async (f) => {
          await mutate(
            "admin/notices",
            {
              ...(n ? { id: n.id } : {}),
              title: f.get("title"),
              content: f.get("content"),
              kind: f.get("kind"),
              audience: f.get("audience"),
              starts_at: f.get("starts_at")
                ? new Date(`${f.get("starts_at")}+09:00`).toISOString()
                : new Date().toISOString(),
              ends_at: f.get("ends_at")
                ? new Date(`${f.get("ends_at")}+09:00`).toISOString()
                : null,
            },
            n ? "PATCH" : "POST",
          );
          close();
        }}
      >
        <Field label="제목" name="title" value={n?.title} required />
        <Field
          label="내용"
          name="content"
          value={n?.content}
          type="textarea"
          required
          rows={7}
        />

        <Field label="유형" name="kind" value={n?.kind || "general"}>
          {[
            { value: "general", label: "일반 공지" },
            { value: "required", label: "필독" },
            { value: "emergency", label: "긴급공지 · 회원 알림" },
            { value: "event", label: "이벤트" },
          ].map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </Field>
        <Field
          label="공개 대상"
          name="audience"
          value={n?.audience || defaultAudience}
        >
          {[
            { value: "public", label: "전체 공개" },
            { value: "member", label: "회원" },
            { value: "admin", label: "운영진" },
          ].map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </Field>
        <details className="post-options">
          <summary>예약 게시 · 게시 종료 설정</summary>
          <Field
            label="게시 시작 · 한국 시간 (비우면 즉시)"
            name="starts_at"
            type="datetime-local"
            value={
              n?.starts_at
                ? `${seoulDate(n.starts_at)}T${formatTime(n.starts_at)}`
                : undefined
            }
          />
          <Field
            label="게시 종료 · 한국 시간 (선택)"
            name="ends_at"
            type="datetime-local"
            value={
              n?.ends_at
                ? `${seoulDate(n.ends_at)}T${formatTime(n.ends_at)}`
                : undefined
            }
          />
        </details>
      </SaveForm>
      {n && (
        <details className="prose">
          <summary>공지 수정 이력 · 현재 v{n.version || 1}</summary>
          <Resource resource={history}>
            {(rows) =>
              rows.map((v: ClubRow) => (
                <details key={v.version}>
                  <summary>
                    v{v.version} · {formatDate(v.recorded_at)}
                    {v.deleted_at ? " · 삭제됨" : ""}
                  </summary>
                  <h3>{v.title}</h3>
                  <p>{v.content}</p>
                </details>
              ))
            }
          </Resource>
        </details>
      )}
      {n && <DeleteButton resource="announcements" id={n.id} done={close} />}
    </Modal>
  );
}

export function VideoEditor({
  video: v,
  close,
}: {
  video?: ClubRow;
  close: () => void;
}) {
  const { boot, mutate, toast } = useApp();
  const [url, setUrl] = useState(v?.url || "");
  const [title, setTitle] = useState(v?.title || "");
  const [meta, setMeta] = useState(false);
  return (
    <Modal title={v ? "영상 수정" : "영상 · 재생목록 등록"} close={close}>
      <SaveForm
        onSubmit={async (f) => {
          await mutate(
            v?.source === "playlists" ||
              (!v &&
                !parseYouTube(url).video_id &&
                parseYouTube(url).playlist_id)
              ? "admin/playlists"
              : "admin/videos",
            {
              ...(v ? { id: v.id } : {}),
              title,
              description: f.get("description"),
              url,
              filmed_on: f.get("filmed_on"),
              kind: f.get("kind"),
              event_id: f.get("event_id") || null,
              visibility: "member",
              video_count: f.get("video_count")
                ? Number(f.get("video_count"))
                : null,
              cover_video_url: f.get("cover_video_url") || "",
            },
            v ? "PATCH" : "POST",
          );
          close();
        }}
      >
        <label className="field">
          <span>YouTube URL *</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="동영상 또는 재생목록 링크"
          />
        </label>
        <button
          type="button"
          className="button secondary full"
          disabled={meta}
          onClick={async () => {
            setMeta(true);
            try {
              const result = await api("admin/youtube", {
                method: "POST",
                body: JSON.stringify({ url }),
              });
              if (result.title) setTitle(result.title);
              else
                toast(
                  "제목을 직접 입력해주세요. 재생목록도 등록할 수 있습니다.",
                );
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setMeta(false);
            }
          }}
        >
          {meta ? "확인 중…" : "제목 자동 가져오기"}
        </button>
        <label className="field">
          <span>제목 *</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </label>
        <Field
          label="설명"
          name="description"
          value={v?.description}
          type="textarea"
        />
        <Field
          label="촬영일"
          name="filmed_on"
          value={v?.filmed_on || seoulDate()}
          type="date"
          required
        />
        <Field label="유형" name="kind" value={v?.kind || "game"}>
          {Object.entries(videoCategories).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Field>
        <Field
          label="재생목록 영상 수"
          name="video_count"
          type="number"
          min="0"
          max="100000"
          value={v?.video_count ?? ""}
          hint="재생목록인 경우 입력합니다. 영상 추가 시 수정할 수 있습니다."
        />
        <Field
          label="재생목록 표지 영상 URL"
          name="cover_video_url"
          type="url"
          value={
            v?.cover_video_id ? `https://youtu.be/${v.cover_video_id}` : ""
          }
          hint="표지로 사용할 YouTube 동영상 링크 (선택)"
        />
        <Field label="연결 일정" name="event_id" value={v?.event_id || ""}>
          <option value="">연결하지 않음</option>
          {boot.events.map((e: ClubEvent) => (
            <option value={e.id} key={e.id}>
              {formatDate(e.starts_at)} {e.title}
            </option>
          ))}
        </Field>
        <p className="hint">영상과 재생목록은 회원·관리자에게만 공개됩니다.</p>
      </SaveForm>
      {v && (
        <DeleteButton
          resource={v.source === "playlists" ? "video_playlists" : "videos"}
          id={v.id}
          done={close}
        />
      )}
    </Modal>
  );
}

export function RuleForm({
  done,
  guest,
  article,
}: {
  done: () => void;
  guest: boolean;
  article?: ClubRow;
}) {
  const { mutate } = useApp();
  return (
    <SaveForm
      onSubmit={async (f) => {
        const category = String(f.get("category") || "").trim();
        if (!article && /^(guest|게스트)/i.test(category) !== guest)
          throw new Error(
            guest
              ? "게스트 분류명은 게스트로 시작해주세요."
              : "게스트 규정은 게스트 관리에서 등록해주세요.",
          );
        await mutate("admin/rules", Object.fromEntries(f));
        done();
      }}
    >
      <Field
        label="카테고리 키 (같은 키는 버전 추가)"
        name="category"
        required
        value={article?.category}
        readOnly={Boolean(article)}
        placeholder={guest ? "게스트 참가" : "회원 / 회비 / 훈련 및 게임"}
      />
      <Field label="회칙 제목" name="title" value={article?.title} required />
      <Field
        label="회칙 내용"
        name="content"
        value={article?.version.content}
        type="textarea"
        required
        rows={10}
      />
      <p className="micro">
        저장하면 새 버전으로 게시됩니다. 기존 동의 기록의 버전은 유지됩니다.
      </p>
    </SaveForm>
  );
}
