import type { ClubRow } from "@/lib/domain";
import { Badge } from "./core";

export function GuestNotices({ notices }: { notices: ClubRow[] }) {
  return (
    <>
      <details className="card prose guest-etiquette" open>
        <summary>게스트 이용 시 참고 사항</summary>
        <ol>
          <li>네트를 교체할 때는 개인 연습을 잠시 멈추고 함께 도와주세요.</li>
          <li>
            코트에서는 원활한 진행을 위해 감독과 코치의 안내를 따라주세요.
          </li>
          <li>
            운동 분위기나 진행에 영향을 주는 상황이 반복되면 추후 게스트 참여가
            제한될 수 있습니다.
          </li>
          <li>운동이 끝나면 뒷정리도 함께해주세요.</li>
          <li>남녀가 번갈아 연습할 때는 쉬는 쪽에서 볼 정리를 도와주세요.</li>
          <li>포지션은 기존 회원에게 먼저 배정될 수 있습니다.</li>
        </ol>
        <p>체육관 오가는 길 안전에 유의하시고, 즐겁게 운동하세요!</p>
      </details>
      {notices.length ? (
        notices.map((n: ClubRow) => (
          <details
            className={`card prose ${n.kind === "emergency" ? "urgent-notice" : ""}`}
            key={`${n.id}:${n.version}`}
          >
            <summary>
              <Badge
                tone={
                  n.kind === "emergency"
                    ? "red"
                    : n.kind === "required"
                      ? "gold"
                      : ""
                }
              >
                {n.kind === "emergency"
                  ? "긴급"
                  : n.kind === "required"
                    ? "필독"
                    : n.kind === "event"
                      ? "이벤트"
                      : "공지"}
              </Badge>{" "}
              {n.title}
            </summary>
            <p>{n.content}</p>
            <small>버전 v{n.version || 1}</small>
          </details>
        ))
      ) : (
        <p className="hint">
          현재 등록된 공개 공지가 없습니다. 신청서에서 운동 일정과 참가 안내를
          확인해주세요.
        </p>
      )}
    </>
  );
}
