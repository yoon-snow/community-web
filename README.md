# SpotLight Volleyball Club

SpotLight 배구동호회 모바일 웹앱/PWA입니다. Navy & Gold 앱 셸, 공개 일정·공지·단계형 게스트 신청, 승인 기반 Google 회원 로그인, 운영진 관리, 출석·회비·유니폼, 영상 아카이브, 알림, Import/Export를 포함합니다.

기존 GitHub `yoon-snow/community-web`의 `main`은 Vercel `community-web` 프로젝트에 연결되어 있습니다. 배포 주소는 [community-web-yoonseol.vercel.app](https://community-web-yoonseol.vercel.app)이며, 2026-11-02 확인 시 Vercel 로그인 보호가 적용되어 있습니다. 프로젝트를 새로 만들지 않고 기존 연결을 유지합니다. 로컬 Supabase·Google OAuth는 미설정 상태로 확인했으며 실제 운영 DB·OAuth·Storage·Push 검증은 아직 수행하지 않았습니다. 연결 전에는 실제 신청 성공을 표시하지 않습니다. 실제 개인정보 Import와 실기기 검증 범위는 `docs/QA.md`에 구분했습니다.

## 기술과 구조

- Next.js 16.4 App Router / React / TypeScript / CSS 변수 기반 모바일 디자인
- Supabase PostgreSQL / Auth (Google PKCE) / private Storage / RLS
- Zod 서버 입력 검증, `read-excel-file` / `write-excel-file`, Web Push
- PGlite PostgreSQL 권한·트랜잭션 테스트, Playwright 모바일 viewport 테스트
- Asia/Seoul. 프런트에서 선택한 역할을 인증에 사용하지 않습니다.

권장안 중 Tailwind 대신 기존 CSS 구조를 확장했습니다. 작은 단일 앱에 추가 빌드 체인을 도입하지 않고 동일한 모바일 토큰·반응형 레이아웃을 유지하기 위한 선택입니다. 기존 MongoDB 모듈과 `/api/health/db`는 이전 진단용으로 보존했으며, 클럽 데이터는 Supabase에 저장합니다.

```text
src/app/                      홈·화면 라우팅, OAuth, API, Manifest
src/components/club/          공통 UI / 공개·회원·관리자·운영 화면
src/lib/domain.ts             입력 검증, 날짜, 공유·Export 보안
src/lib/import.ts             정규화 Import 계약과 검증
src/lib/legacy-import.ts      실제 운영 시트별 변환
src/lib/supabase/             요청별 SSR 세션 / 서버 전용 서비스 클라이언트
src/lib/push.ts               Web Push outbox 전달·재시도
supabase/migrations/          스키마·RLS·트랜잭션 RPC·집계
supabase/bootstrap-admin.sql  프로젝트 소유자의 최초 운영진 지정
scripts/                     로컬 Seed·아이콘·원본 시트 변환
```

ERD, 권한표, 인증·알림 설계: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). 실제 원본 매핑: [docs/MIGRATION.md](docs/MIGRATION.md).

## 로컬 실행

Node.js **24.x** / npm이 필요합니다.

```sh
npm ci
cp .env.example .env.local
# 기존 .env.local이 있다면 덮어쓰지 말고 필요한 항목을 추가합니다.
npm run dev
```

- 앱: `http://localhost:3000`
- UI 미리보기: `http://localhost:3000/preview?role=guest`, `?role=member`, `/preview/admin?role=admin`
- 미리보기는 개발 환경에서만 기본 허용됩니다. 가상 데이터 표시가 고정되며 실제 쓰기를 수행하지 않습니다. Production에서는 `NEXT_PUBLIC_ENABLE_PREVIEW=false`를 유지하세요.
- DB 미설정 시 준비 중 화면과 로그인 비활성 상태를 표시합니다. 실제 회원·게스트 숫자를 가상으로 채우지 않습니다.

## 환경변수

전체 항목은 `.env.example`에 있습니다. Secret은 `.env.local` 또는 배포 서비스의 비밀 환경변수로만 설정합니다.

| 변수                                            | 용도                                                      |
| ----------------------------------------------- | --------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL                        | 프로젝트 URL                                              |
| NEXT_PUBLIC_SUPABASE_ANON_KEY                   | 공개 anon/publishable API 키 값. 서비스 키를 넣지 마세요. |
| SUPABASE_SERVICE_ROLE_KEY                       | 서버 전용. 익명 신청 트랜잭션·예약 알림·Push 전달         |
| APP_URL                                         | 정확한 앱 origin. Production HTTPS, 끝 `/` 제외           |
| PRIVACY_POLICY_TEXT                             | 운영자가 확정한 개인정보 수집·이용 안내 전체 텍스트       |
| PRIVACY_RETENTION_DAYS                          | 운영자가 확정한 보관 일수                                 |
| PRIVACY_CONTACT                                 | 개인정보 문의처                                           |
| CLUB_BANK_NAME / ACCOUNT / HOLDER               | 기존 회칙의 계좌·예금주; 변경 시 운영진이 확인            |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PUBLIC_KEY | 동일한 Web Push 공개 키                                   |
| VAPID_PRIVATE_KEY / VAPID_SUBJECT               | 서버 전용 비밀 키 / 실제 운영자 mailto 주소               |
| CRON_SECRET                                     | `openssl rand -hex 32` 등으로 생성한 예약 작업용 비밀 값  |
| NEXT_PUBLIC_ENABLE_PREVIEW                      | Production은 false                                        |
| MONGODB_URI                                     | 기존 진단용 선택값; 클럽 앱에는 불필요                    |

기존 개인정보 안내에는 “일정 기간”만 있어 실제 보관 일수와 문의처를 임의 결정하지 않았습니다. 개인정보 안내 3개 값이 없으면 실제 신청 접수를 차단합니다. 수동 삭제/보관 정책의 운영 절차도 확정하세요. 보관 기간을 입력했다는 이유만으로 자동 삭제 작업이 실행되는 것은 아닙니다.

## Supabase와 마이그레이션

1. Supabase 계정을 만들고 **개발/스테이징과 Production을 별도 프로젝트**로 생성합니다. DB 비밀번호는 비밀 저장소에 보관합니다.
2. 프로젝트 설정에서 URL과 공개 API 키, 서버 전용 서비스 역할 키를 확인해 환경변수에 설정합니다. 서비스 키를 `NEXT_PUBLIC_` 변수로 노출하지 않습니다.
3. Supabase CLI의 [공식 설치/마이그레이션 안내](https://supabase.com/docs/guides/local-development/database-migrations)를 따라 CLI를 준비합니다.
4. 로컬에서 확인한 후 대상 프로젝트에 연결해 적용합니다.

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

CLI가 없다면 `supabase/migrations/` SQL 파일들을 파일명 순서대로 Supabase SQL Editor에서 실행할 수 있습니다. 기존 DB에 임의 적용하지 말고 새 프로젝트/백업된 스테이징에서 시작하세요. 마이그레이션은 기본적으로 1회 적용용입니다.

`private` 스키마는 API Exposed Schemas에 **추가하지 않습니다**. `public` 테이블은 전부 RLS가 켜집니다. 역할은 `members`와 `admins`에서만 읽습니다. `auth.users`는 Supabase가 관리합니다. 관리자는 모든 회원 개인정보를 볼 수 있지만, 일반 회원은 자기 행만 볼 수 있습니다. 관리자 메모는 별도 `member_notes`에 있습니다. 게스트는 개인 테이블 SELECT 권한 자체가 없습니다. 민감 명령 RPC는 각각 DB에서 역할을 재검사합니다.

`avatars` 버킷은 마이그레이션으로 비공개 생성됩니다. 5MB, JPEG/PNG/WebP만 허용하고 소유자·운영진 정책을 적용합니다. 프로필 이미지는 서명 URL로 표시합니다.

## 운동 일정·캘린더·공지 단계

기존 기능과 테이블을 유지하고 `supabase/migrations/202611020006_events_announcements.sql`을 순서대로 추가 적용합니다. 배포된 DB를 초기화하거나 Seed로 덮어쓰지 않습니다.

- 관리자는 6종 운동 일정과 4종 공지의 생성·수정·삭제를 수행합니다. 날짜/시간은 한국 시간으로 입력하고 UTC instant로 저장합니다.
- 공용 `/calendar`는 Guest/Member/Admin이 열람합니다. 운영진은 `/admin/calendar`에서 관리 메뉴를 유지하며 일정 상세·편집으로 이동합니다.
- 긴급 변경은 `events.is_emergency` / `change_reason`으로 기록하고 빨간색 상태 라벨과 날짜 마커로 표시합니다. 기존 참석/불참 기능은 유지합니다.
- 홈은 긴급공지 → 일반 콘텐츠 순서입니다. 공지는 긴급 → 필독 → 이벤트 → 일반 순서이며 대상·게시 기간·삭제 상태를 API와 RLS에서 검사합니다.
- 일정과 공지는 숨김 삭제합니다. 출석/신청 관계와 공지 이력을 지우지 않습니다. `announcement_versions`는 수정 당시 본문·대상·게시 기간을 변경 불가능한 버전으로 보관합니다. 기존 공지는 현재 내용을 v1으로 기록하며 과거에 존재하지 않는 수정 이력은 만들어내지 않습니다.
- 게스트 흐름은 홈 → 일정 상세 → `/guest-guide?event=...` → 공지 확인 → 단계형 신청입니다. 최종 동의 시 확인한 버전을 고정하고 `guest_applications.announcement_versions`에 저장합니다. 기존 `rule_versions` 기록도 유지합니다. 안내가 바뀌면 재확인을 요구하고, DB가 오래되거나 비공개인 공지 버전의 제출을 거절합니다.
- 미리보기는 가상 데이터이고 실제 저장을 수행하지 않습니다. 운영 계정 CRUD와 실제 공개 배포 검증은 Supabase/Google OAuth/호스팅 연결 후 진행합니다.

## 게스트 신청 단계

기존 마이그레이션 뒤에 `supabase/migrations/202611020007_guest_intake.sql`을 추가 적용합니다. 기존 신청·게스트·입금·회원·권한 데이터는 그대로 두고 컬럼과 RPC만 추가합니다.

- 기존 Google Form 응답의 기본 항목을 유지합니다. 게스트는 로그인 없이 신청하며, 정규화된 휴대전화번호로 동일 게스트의 신청을 연결합니다. 이름으로 병합하거나 기존 게스트의 이름·기본 포지션을 익명 신청으로 덮어쓰지 않습니다. 각 신청에는 당시 이름·희망 포지션 등의 응답을 별도 저장합니다.
- 공지·참가 규정·사진/영상·개인정보의 네 필수 확인을 받습니다. 공지/회칙 버전과 질문 버전·문구·선택지, 접수 당시 개인정보 안내를 보관합니다. 신청 도중 질문이나 공지가 바뀌면 최신 내용을 다시 확인해야 합니다.
- 관리자 → 더보기 → 신청 질문에서 기본 문구·도움말을 수정하고 추가 질문을 등록/수정/삭제합니다. 기본 필수 항목의 구조는 유지합니다. 질문 고유키는 기존 답변과 연결되므로 변경하지 않고, 삭제는 보관 처리하여 과거 응답을 보존합니다.
- 완료 화면은 해당 접수의 운동 날짜/시간·장소·게스트비·계좌·입금자명·접수 시점의 실제 입금 상태를 표시합니다. 본인의 입금 응답과 관리자 확인은 분리되며, 관리자의 `입금확인` 이후에만 `입금완료`입니다. 중복 확인은 최초 확인자/시간을 덮어쓰지 않습니다.
- 관리자 신청 상세에는 동일 게스트의 신청 수·확인된 방문 수·최근 방문일·최근 20건 기록이 표시됩니다. 운동 종료 후 입금완료 건의 방문/불참을 운영진이 확인합니다. 미래 일정과 출석 미확인 과거 자료를 방문으로 추정하지 않습니다.
- 신규 신청·13시 명단 알림은 관리자 전용입니다. 회원은 기존과 같이 입금완료 게스트의 집계 인원만 확인합니다. 정원·대기자·현장결제는 사용하지 않습니다.
- `submit_guest_receipt`는 서버 서비스 역할만 호출하며, 기존 `submit_guest` UUID 반환 계약을 유지합니다. 다른 신청이나 기존 게스트 정보를 조회하는 공개 접수번호 API는 없습니다.

## 회원 기능 단계

기존 마이그레이션 뒤에 `supabase/migrations/202611020008_members.sql`을 추가 적용합니다. 기존 회원·가입 신청·출석·회비·일정 응답·운영진 역할을 유지합니다.

- Google 로그인 후 회원 가입서를 작성합니다. 기본 정보·동의·유입 경로·기타 확인사항·가입비/회비 입금 응답·당월 게스트 참여 여부와 내역을 보관합니다. 본인의 입금 응답만으로 실제 회비를 납부 처리하지 않습니다.
- 관리자 회원 화면에서 승인/보류/거절과 신청자에게 표시할 검토 안내를 저장합니다. 승인 시에만 회원 계정이 활성화됩니다. 기존 회원 연결은 검증된 UUID·전화번호로 수행합니다.
- 회원 홈은 긴급공지, 다음 운동, 참석/불참/미응답, 본인의 올해/이번 달 실제 출석·최근 참석·이번 달 회비 상태를 표시합니다. 집계는 화면의 최근 500개 기록에 의존하지 않고 DB에서 계산하며, 미래·취소·삭제 운동을 실제 출석에 포함하지 않습니다.
- 내 프로필에서 가입일·생년월일·회원 상태·유니폼·연락처·포지션·경력을 확인하고 일부 정보를 수정합니다. 관리자도 같은 개인 프로필을 사용하며 여러 직책·역할을 함께 표시합니다.
- 모바일 사진첩에서 사진을 선택하면 바로 저장하고 프로필을 갱신합니다. 사진 교체/삭제는 별도 명령으로 처리하여 오래된 프로필 저장이 삭제한 사진을 되살리지 못하게 합니다. 사진은 비공개 Storage와 짧은 서명 URL을 사용하며, 없으면 원형 아바타에 이름 첫 글자를 표시합니다.
- 이름은 본인이 변경 요청하고 관리자가 승인하거나, 관리자가 회원 상세에서 직접 수정합니다. 요청 상태·검토 사유·처리자를 보관하며, 이미 수정된 이름에 오래된 요청을 승인하지 않습니다. 모든 기록은 계속 같은 `member_id`에 연결됩니다.
- 회원은 다른 회원의 개인 행·생년월일·연락처·회비·운영진 메모를 조회할 수 없습니다. 향후 디렉터리용 이름/사진/포지션 공개 선택은 별도 `member_directory_preferences`에 준비했고 기본값은 모두 비공개입니다. 이번 단계는 전체 회원 디렉터리를 공개하지 않습니다.

## 회원 운영·관리자 화면 단계

`supabase/migrations/202611020009_member_operations.sql`을 기존 마이그레이션 뒤에 추가합니다. 기존 테이블·ID·RLS·신청/입금/출석/회비 기록은 유지합니다.

- 참석/불참/미응답을 실제 API·DB에서 모두 지원합니다. 사전 응답은 실제 출석과 독립적이며, 운동 종료 후 관리자가 출석 또는 불참을 확정합니다. 미래·취소·휴무·삭제 운동에는 출석을 확정하지 않습니다.
- 회원의 내 출석은 연도 선택, 12개월 집계, 최근 참석일, 30개씩의 전체 기록 조회를 지원합니다. 집계는 운동 시작일의 한국 날짜를 사용합니다. 관리자는 회원별 전체 출석 기록과 운동별 응답/실제 출석을 조회하며, 과거 출석이 있는 비활성 회원도 운영 명단에서 보존합니다.
- 회비 관리에 전체/납부완료/미납/면제 필터, 선택 월 집계와 ‘이번 달 미납자 보기’를 추가했습니다. 바로가기는 과거 월·개별 회원 필터를 초기화합니다. 미등록 회비를 임의로 미납 처리하지 않습니다. 회원은 본인 회비만 읽을 수 있습니다.
- 관리자 홈의 다섯 참가 지표와 미응답 수는 동일한 선택 운동을 기준으로 계산합니다. 오늘 운동이 여러 개면 집계 운동을 선택하고, 오늘 운동이 없으면 다음 운동을 표시합니다. 유효한 운동이 없을 때 미응답자는 0입니다. 최근 신청은 최신 5건입니다.
- 관리자 게스트 카드에는 성별·연락처·포지션·경력·신청 시간·실제 입금 상태를 표시합니다. 회원은 여전히 입금완료 게스트 집계만 받으며 개별 명단은 API와 RLS에서 차단합니다.
- 관리자 회원 상세에 정확한 올해/전체 출석·최근 참석일·이번 달 회비를 표시하고 기존 사진/이름/프로필/직책/역할/회원 상태/메모 수정과 가입 승인/보류/거절을 유지합니다. 신규 가입 알림과 Outbox는 활성 관리자에게만 생성됩니다.
- 오프라인 안내는 네트워크와 서버 연결 실패를 구분해 설명합니다. 로컬 개발 서버가 꺼진 경우 인터넷 단절이라고 단정하지 않습니다. 개인정보는 계속 오프라인 캐시에 저장하지 않습니다.

## Google OAuth 설정

1. [Supabase Google 로그인 공식 안내](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)를 엽니다.
2. Google Cloud Console에서 프로젝트를 만들거나 선택합니다. Google Auth Platform의 Branding/Audience에서 앱 이름, 지원 이메일, 대상 사용자를 설정합니다. 테스트 모드에서는 사용할 Google 계정을 테스트 사용자로 등록합니다.
3. OAuth Client를 **Web application**으로 생성합니다.
4. Authorized redirect URIs에 Supabase Dashboard의 Google Provider 화면에 표시되는 콜백 주소를 그대로 등록합니다. 보통 `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` 형식입니다. **앱의 `/auth/callback`과 혼동하지 마세요.**
5. 발급된 Google Client ID와 Client Secret을 Supabase **Authentication → Sign In / Providers → Google**에 저장하고 활성화합니다. Google Secret을 앱의 공개 변수에 넣지 않습니다.
6. Supabase **Authentication → URL Configuration**의 Site URL을 실제 앱 HTTPS origin으로 설정합니다. Redirect URLs에 `https://YOUR_APP_DOMAIN/auth/callback`을 정확히 등록합니다. 개발 프로젝트에는 `http://localhost:3000/auth/callback`을 별도로 등록합니다.
7. Vercel의 `APP_URL`도 같은 앱 origin으로 설정하고 다시 배포합니다. 무제한 와일드카드 Production redirect는 사용하지 않습니다.
8. 앱의 “Google로 계속하기”를 확인합니다. 인증 성공만으로 회원이 되지 않습니다. 미승인 사용자는 회원 신청 화면으로 이동하고, 관리자 승인 이후에만 회원 화면을 사용할 수 있습니다.

기존 Imported 회원과 Google 계정을 이메일만으로 자동 연결하지 않습니다. 가입 신청의 전화번호·실제 회원 신원을 운영진이 확인한 뒤 회원 UUID로 연결합니다. Imported 과거 가입 신청에는 임의의 auth user를 만들지 않습니다.

## 최초 Admin

1. 실제 운영진이 Google 로그인을 1회 수행합니다. 회원 승인이 없어도 Auth 사용자 행은 생성됩니다.
2. 프로젝트 소유자가 Supabase SQL Editor에서 해당 사용자의 `auth.users.id`, 이메일, 실제 회원 전화번호를 확인합니다.
3. `members`에 본인의 검증된 회원 기록이 없으면 직접 생성하거나 회원명단을 Import합니다. 이름을 관계키로 사용하지 않습니다.
4. `supabase/bootstrap-admin.sql`의 이메일·전화번호 placeholder를 검증된 값으로 바꿔 SQL Editor에서 실행합니다.
5. 재로그인/새로고침 후 운영진 메뉴를 확인합니다.

Bootstrap용 공개 API, 기본 관리자 비밀번호, 자동 이메일 승격은 없습니다. 이후 다른 운영진은 앱의 회원 상세 → 운영진 권한에서 지정합니다. 본인 권한 변경은 다른 운영진이 수행합니다.

## Seed / 테스트 데이터

UI 미리보기는 DB에 쓰지 않습니다. 실제 DB용 Seed는 **localhost Supabase에서만** 실행할 수 있습니다.

```sh
# Docker와 Supabase CLI가 설치된 개발 머신에서
npx supabase start
npx supabase db reset
# .env.local에 supabase status의 로컬 URL/anon/service 키를 설정
npm run seed:local
```

가상 운영진 1명·회원 4명·게스트 3명·과거/미래 일정·출석·회비·공지·회칙·영상이 생성됩니다. Seed 스크립트는 원격 URL을 거부합니다. 자동 build/deploy 중에는 실행하지 않습니다. 로컬 Auth 사용자는 무작위 비밀번호로 생성되며 로그인 시뮬레이션은 Supabase Studio에서만 준비합니다. UI 미리보기 역할 선택은 인증 대체 수단이 아닙니다.

## PWA / 알림 / 예약 작업

Manifest, 192/512 PNG 아이콘, maskable 아이콘, Apple touch icon, standalone, safe area, 서비스 워커를 포함합니다. HTTPS 배포 후 Android는 브라우저 “설치”, iPhone은 Safari “공유 → 홈 화면에 추가”로 설치합니다. 설정 화면에서도 설치 안내를 제공합니다.

서비스 워커는 공개 offline 안내와 아이콘만 저장합니다. 인증된 HTML/API/프로필/영상 데이터를 캐시하지 않습니다. 오프라인 쓰기는 재연결 후 다시 시도해야 합니다.

```sh
npx web-push generate-vapid-keys
```

출력 공개/비밀 키를 환경변수에 설정하고 `VAPID_SUBJECT`를 운영자 주소로 바꿉니다. 로그인한 회원이 알림 화면에서 버튼을 누른 뒤 권한을 요청합니다. 거절/미지원 시 인앱 알림은 계속 사용할 수 있습니다. iPhone Web Push는 홈 화면에 설치한 앱에서 실기기 확인이 필요합니다.

- 신규 게스트/회원 신청: Admin 전용 DB 트리거
- 게스트 신청 알림에는 한국 시간의 운동 날짜와 관리자 신청 상세 링크가 포함됩니다. 회원 인앱/Push에서는 게스트 신청·입금·운영 명단 알림을 차단합니다.
- 기존 DB 업그레이드: `202611020005_guest_notification_privacy.sql`은 기존 테이블과 기록을 유지하고, 관리자 전용 집계 RPC·알림 생성 가드·과거 알림 조회 정책을 보강합니다. 과거에 잘못 연결된 회원용 운영 알림은 숨기고 대기 중 Push를 발송 대상에서 제외합니다.
- 긴급공지는 공개대상에 맞는 활성 회원에게 전송. 운영진 전용 공지는 운영진만 수신
- KST 13:00 이후 당일 운동이 있을 때만 운영진에게 명단 준비 알림. 행사·사용자·날짜별 중복 방지
- Outbox claim/재시도 최대 5회, 만료된 Push subscription 삭제, 전달 직전 활성 권한 재검사
- `GET /api/club/cron`은 `Authorization: Bearer CRON_SECRET` 필수. 요청·응답에 개인정보나 서비스 키를 넣지 않습니다.

`vercel.json`은 5분마다 Cron을 실행해 예약 공지/Push 재시도/13시 명단을 처리합니다. **이 빈도는 Vercel Pro 또는 동등한 분 단위 스케줄러가 필요합니다.** Hobby의 일 1회·시간 단위 지연으로는 정확한 13시와 예약 공지 요구를 충족하지 않습니다. [Vercel 공식 제한](https://vercel.com/docs/cron-jobs/usage-and-pricing)을 확인한 후 호스팅을 선택하세요. 유료 가입은 자동 진행하지 않습니다. 다른 스케줄러는 같은 HTTPS endpoint를 비밀 Authorization 헤더로 호출하면 됩니다. 최초 사용자 접수 직후 Push는 응답 후 전달하고, 실패는 다음 Cron에서 재시도합니다.

## Import / Export

운영진 → 더보기 → Import/Export. 원본 Google Sheet를 앱이 직접 변경하지 않습니다.

- .xlsx/.csv, 5MB 이하. 시트·헤더 행·열 매핑 선택. 정규화 행 최대 2,000개
- UUID 외래키 필수, 전화번호 정규화, 모호한 생년/날짜·결제 상태 오류 표시
- 미리보기 신규/병합/오류 → 명시적 운영진 확정
- 서버 저장 batch ID/digest/소유자/1시간 만료 검사. 전체 트랜잭션; 반복 확정은 중복 반영하지 않음
- Import가 실제 계좌 입금을 자동 인증하지 않음. 게스트의 본인 응답과 실제 입금 상태 분리
- Expo​rt Excel/CSV. 현재 상태·기간·회원·일정 필터 유지, 페이지를 순회해 전체 대상 조회, 최대 50,000행이면 기간 분할 필요
- CSV Formula Injection 방지. 공유 명단은 이름/포지션만 별도로 생성

원본 SpotLight의 가로형 시트는 변환 도구를 먼저 사용합니다. 예:

```sh
node scripts/transform-workbook.mjs source.xlsx "회원명단" members docs/import-map.example.json
node scripts/transform-workbook.mjs source.xlsx "회비납부명단(2026년)" membership_payments .local-data/reviewed-map.json
node scripts/transform-workbook.mjs source.xlsx "출석원본" event_attendance .local-data/reviewed-map.json
```

`docs/import-map.example.json`을 복사해 검증한 회원/게스트/일정 ID, 출석 기호, 결제 상태를 입력합니다. 이름 중복은 사람이 먼저 해소하고 개별 ID 매핑을 만듭니다. 두 회원명단 그룹 분리, 월별 회비/출석 unpivot, 원본 신청 답변 보존, 전화번호 기반 게스트 분리를 지원합니다. source Sheet timezone이 Asia/Dili이므로 `timestampOffset`을 실제 기록 기준과 대조해 확정해야 합니다. 출력은 `.local-data/` CSV와 `.issues.json`이며 Git에서 제외됩니다. 오류가 있으면 종료코드 2이고 실제 Import 전에 해결해야 합니다. `출석부`의 집계 숫자로 상세 출석을 만들어내지 않습니다. 자세한 매핑/예외는 `docs/MIGRATION.md`에 있습니다.

## 검증 / Build

```sh
npm test
npm run typecheck
npm run build
npm start
# 별도 터미널: npm run dev 실행 중에
npm run test:e2e
```

E2E는 개발 미리보기와 DB 미설정 셸에 대해 동작합니다. 로컬 Chrome 기본 경로가 다르면 `CHROME_PATH`를 지정합니다. Chrome 미설치 환경에서는 `npx playwright install chromium` 후 config의 executablePath를 해당 환경에 맞춰 조정합니다. 실제 Supabase Google 로그인은 자동으로 우회하지 않습니다.

## 배포

1. Supabase migration/Google Provider/최초 Admin/환경변수를 준비하고 스테이징에서 실제 계정으로 검증합니다.
2. 기존 Vercel `community-web` 프로젝트와 GitHub `main` 연결을 사용합니다. Framework Next.js, Node 24.x, Build `npm run build`, Output 기본값과 프로젝트 루트를 확인합니다. 연결된 프로젝트를 중복 생성하지 않습니다.
3. Preview에는 개발 Supabase, Production에는 운영 Supabase 환경변수를 각각 등록합니다. `.env.local`을 업로드하거나 저장소에 올리지 않습니다.
4. 생성된 실제 Vercel HTTPS 도메인을 `APP_URL`과 Supabase 허용 redirect에 등록하고 재배포합니다. 앱 아이콘·manifest·service worker를 확인합니다.
5. Cron을 지원하는 플랜/외부 스케줄러를 연결합니다. Push 공개·비밀 키 일치와 `CRON_SECRET`을 확인합니다.
6. `docs/QA.md`의 실계정·실기기 체크를 수행하고 기존 데이터 Import는 백업된 스테이징에서 검증한 후 Production에 확정합니다.
7. 커스텀 도메인은 Vercel Project → Settings → Domains에서 소유 도메인을 추가하고 안내된 DNS를 설정합니다. 변경 후 APP_URL, Supabase Site/Redirect URL, Google 허용 origin을 함께 갱신합니다.

Vercel 배포 연결과 별개로 Supabase 운영 연결·개인정보 정책 검증이 남아 있어 이 저장소의 검증만으로 실운영이 완료되었다고 볼 수 없습니다. 실계정 OAuth, Supabase Storage, Push, 원본 전체 Import와 첫 Production 배포는 남아 있습니다.
