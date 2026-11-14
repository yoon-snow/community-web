import type { ClubRow } from "@/lib/domain";
import { Badge } from "./core";

export function GuestEtiquette() {
  return (
    <details className="card prose guest-etiquette" open>
      <summary>📢 게스트 이용 시 참고 사항</summary>
      <ol>
        <li>
          네트 교체 시에는 개인 연습을 잠시 멈추고, 모두 함께 네트 교체에 협조해
          주시면 감사하겠습니다.
        </li>
        <li>
          코트 내에서는 원활한 진행을 위해 감독 및 코치의 안내에 따라주세요!
        </li>
        <li>
          운동 분위기 및 운영에 영향을 주는 상황이 반복될 경우, 부득이하게 추후
          게스트 참여에 제한이 있을 수 있는 점 양해 부탁드립니다.
        </li>
        <li>운동 종료 후에는 뒷정리도 함께 도와주세요!</li>
        <li>
          남녀가 번갈아 연습하는 경우, 한쪽이 연습할 때 다른 쪽은 볼 정리를
          해주는게 운동 센스 🙂 !
        </li>
        <li>
          동호회 운영 특성상 기존 회원분들 먼저 포지션이 배정될 수 있는 점 양해
          부탁드립니다.
        </li>
      </ol>
      <p>
        체육관 오고 가실 때 안전에 유의해 주시고,
        <br />
        오늘도 즐겁게 운동할 수 있는 시간이 되길 바랍니다.
      </p>
    </details>
  );
}
export function GuestNotices({ notices }: { notices: ClubRow[] }) {
  return (
    <>
      <GuestEtiquette />
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
