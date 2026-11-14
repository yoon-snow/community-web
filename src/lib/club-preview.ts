import {
  previewData as baseData,
  previewResource as baseResource,
} from "./preview";
import type { ClubRow } from "./domain";
export function previewData(role: string) {
  return {
    ...baseData(role),
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
