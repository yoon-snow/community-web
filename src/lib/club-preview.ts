import {
  previewData as baseData,
  previewResource as baseResource,
} from "./preview";
import { eventKinds, type ClubRow } from "./domain";
const storageKey = "spotlight-demo-schedule-kinds";
function previewKinds(): ClubRow[] {
  const saved =
    typeof window !== "undefined" && sessionStorage.getItem(storageKey);
  if (saved) return JSON.parse(saved);
  const colors: Record<string, string> = {
    game: "#24477C",
    lesson: "#B4881C",
    match: "#007A78",
    tournament: "#90529B",
    social: "#B95631",
    other: "#576779",
    practice: "#52834B",
    event: "#965680",
    holiday: "#737373",
  };
  return Object.entries(eventKinds).map(([key, label]) => ({
    key,
    label,
    color: colors[key],
  }));
}
export function updatePreviewKind(method: string, data: ClubRow) {
  const kinds = previewKinds();
  if (method === "POST") kinds.push({ ...data, key: crypto.randomUUID() });
  else {
    const kind = kinds.find((k) => k.key === data.key);
    if (!kind) throw new Error("종류를 찾을 수 없습니다.");
    if (method === "DELETE") kind.archived = true;
    else Object.assign(kind, { label: data.label, color: data.color });
  }
  sessionStorage.setItem(storageKey, JSON.stringify(kinds));
}
export function previewData(role: string) {
  const scheduleKinds = previewKinds();
  const base = baseData(role);
  return {
    ...base,
    announcements: base.announcements.map((n) => ({
      ...n,
      pinned: demoSetting("pin", n.id) === "true",
    })),
    scheduleKinds,
    archivedKinds: scheduleKinds.filter((k) => k.archived).map((k) => k.key),
    rules: [
      "회원",
      "게스트",
      "가입절차",
      "임원",
      "회비",
      "훈련 및 게임",
      "게스트 참가 및 환불 규정",
      "병가",
      "회원탈퇴",
      "사진 및 영상",
      "단체 채팅방",
    ].map((title, i) => ({
      id: "preview-rule-" + i,
      category: title,
      title,
      current_version: 1,
      rule_versions: [{ version: 1, published: true, content: "" }],
    })),
  };
}
function demoSetting(group: string, id: string) {
  return typeof window === "undefined"
    ? null
    : sessionStorage.getItem("spotlight-demo-" + group + "-" + id);
}
export function updateDemoVoteOrPin(path: string, data: ClubRow) {
  if (path === "rsvp")
    sessionStorage.setItem(
      "spotlight-demo-vote-" + data.event_id,
      data.response,
    );
  else
    sessionStorage.setItem(
      "spotlight-demo-pin-" + data.id,
      String(data.pinned),
    );
}
const duesKey = "spotlight-demo-monthly-dues";
export function saveDemoDues(data: ClubRow) {
  const rows: ClubRow[] = JSON.parse(sessionStorage.getItem(duesKey) || "[]");
  const prior = rows.find(
    (p) => p.member_id === data.member_id && p.month === data.month,
  );
  const value = {
    ...prior,
    member_id: data.member_id,
    month: data.month,
    status: data.status || (data.paid ? "paid" : "unpaid"),
    amount: data.amount ?? prior?.amount ?? 60000,
  };
  sessionStorage.setItem(
    duesKey,
    JSON.stringify([...rows.filter((p) => p !== prior), value]),
  );
}
export function previewResource(path: string, boot: ClubRow) {
  if (typeof window !== "undefined")
    boot = {
      ...boot,
      demoDues: JSON.parse(sessionStorage.getItem(duesKey) || "[]"),
    };

  if (
    (path.startsWith("member-votes/") || path.startsWith("events/")) &&
    boot.member
  ) {
    const response = demoSetting("vote", path.split("/")[1]) || "unanswered";
    const rows = [
      { name: boot.member.name, response },
      { name: "라이트", response: "yes" },
      { name: "코트", response: "yes" },
      { name: "리시브", response: "no" },
      { name: "토스", response: "unanswered" },
      { name: "서브", response: "yes" },
    ];
    if (path.startsWith("member-votes/")) return rows;
    const result = baseResource(path, boot);
    const members = rows.filter((row) => row.response === "yes").length;
    return {
      ...result,
      response,
      counts:
        boot.role === "admin"
          ? { ...result.counts, members, total: members + result.counts.guests }
          : { members },
    };
  }
  if (path.startsWith("post-comments/"))
    return {
      rows: path.includes("&parent=")
        ? []
        : [
            {
              id: "demo-comment",
              body: "안내 확인했습니다. 코트에서 만나요!",
              mine: false,
              created_at: new Date().toISOString(),
            },
          ],
      more: false,
    };
  if (
    path.startsWith("admin/notices?") ||
    path === "admin/notices" ||
    path.startsWith("notices?")
  ) {
    const announcements = boot.announcements.map((n: ClubRow) => ({
      ...n,
      pinned: demoSetting("pin", n.id) === "true",
    }));
    if (path.startsWith("admin/notices?"))
      return announcements
        .filter(
          (n: ClubRow) =>
            n.audience ===
            new URLSearchParams(path.split("?")[1]).get("audience"),
        )
        .sort((a: ClubRow, b: ClubRow) => Number(b.pinned) - Number(a.pinned));
    return baseResource(path, { ...boot, announcements });
  }
  return baseResource(path, boot);
}
