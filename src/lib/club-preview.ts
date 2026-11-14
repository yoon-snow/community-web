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
  return {
    ...baseData(role),
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
export function previewResource(path: string, boot: ClubRow) {
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
  return baseResource(path, boot);
}
