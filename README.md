# Community Web

소규모 커뮤니티를 위한 Next.js App Router + TypeScript 초기 환경입니다. API는 Vercel에서 Node.js 서버리스 함수로 실행됩니다. MongoDB 공식 드라이버만 사용하며 ORM, 인증 라이브러리, 별도 Express 서버는 없습니다. 회원가입·로그인, 공지·게시글, 일정·출석 기능과 DB 컬렉션은 아직 구현하지 않았습니다.

## 구조

```text
src/
  app/
    layout.tsx                  # 공통 레이아웃
    page.tsx                    # 초기 안내 화면
    api/health/db/route.ts       # GET /api/health/db (Node.js)
  lib/mongodb.ts                # 서버 전용 연결 재사용
  features/
    auth/                       # 향후 회원가입·로그인
    posts/                      # 향후 공지·게시글
    events/                     # 향후 일정·출석
```

각 기능 폴더에는 범위를 설명하는 README만 있습니다. 이후 UI와 기능 코드를 추가하고, HTTP 엔드포인트는 `src/app/api/` 아래에 Route Handler로 작성하세요. DB 접근이 있는 API에는 `export const runtime = "nodejs"`를 명시하세요.

## 1. MongoDB Atlas 설정 (직접 진행)

1. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)에 가입해 프로젝트와 클러스터를 만듭니다. 소규모 개발용으로 제공되는 무료 구성을 선택할 수 있습니다. Vercel 함수와 가까운 리전을 선택하세요.
2. **Database Access**에서 애플리케이션용 DB 사용자를 만듭니다. Atlas 웹 로그인 계정과 다른 계정입니다. 강한 고유 비밀번호와 `community` DB에 한정한 `readWrite` 권한을 부여하세요.
3. **Network Access → IP Access List**에서 로컬 개발에 사용하는 현재 공인 IP를 추가합니다. IP가 바뀌면 갱신하세요.
4. 클러스터의 **Connect → Drivers → Node.js**에서 연결 문자열을 복사합니다. 사용자명·비밀번호를 채우고 URI의 DB 경로를 `/community`로 지정합니다. 사용자명·비밀번호에 특수문자가 있으면 해당 부분만 URL 인코딩합니다. Atlas가 제공한 쿼리 옵션은 유지하세요.

Vercel 배포는 로컬 IP만 허용해서는 연결되지 않습니다. Vercel의 기본 outbound IP는 동적이므로, 운영에서는 [Static IPs 또는 Secure Compute](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address)를 설정하고 해당 주소를 Atlas 접근 목록에 추가하는 방법을 권장합니다. 사용 가능 여부와 비용은 계정에서 확인하세요. 간단한 개발 배포에서 고정 IP를 사용할 수 없다면 Atlas에서 `0.0.0.0/0`을 임시 허용할 수 있지만, 이는 모든 IP에 DB 네트워크 접근을 여는 설정입니다. 이 경우에도 DB 인증은 필요하며, 최소 권한 사용자와 강한 비밀번호를 사용하고 검증 후 범위를 제한하세요.

## 2. 로컬 실행

Node.js **24.x**와 npm을 사용합니다 (`.nvmrc`, `package.json`에 명시).

```sh
cd community-web
npm ci
cp .env.example .env.local
# .env.local의 MONGODB_URI를 실제 Atlas URI로 교체
npm run dev
```

[http://localhost:3000](http://localhost:3000)을 엽니다. 환경변수를 바꾸면 서버를 다시 시작하세요. `.env.local`은 프로젝트 루트에 둡니다.

```sh
curl -i http://localhost:3000/api/health/db
```

- 연결 성공: HTTP `200`, `{"ok":true}`
- URI 누락·잘못된 값·접속 실패: HTTP `503`, `{"ok":false}`

응답에는 URI, 호스트, DB명, 사용자, 원본 오류가 포함되지 않으며 `Cache-Control: no-store`가 적용됩니다. API는 DB의 `ping`만 실행하고 데이터를 생성하지 않습니다. `ping` 성공은 CRUD 권한이나 향후 기능의 정상 동작까지 보장하지 않습니다. 실패 시 Atlas의 사용자·비밀번호, IP 허용 목록, URI, 클러스터 상태를 직접 확인하세요.

빌드와 프로덕션 실행:

```sh
npm run typecheck
npm test
npm run build
npm start
```

홈 화면과 빌드에는 DB 연결이 필요 없습니다. 실제 Atlas 연결 성공 검증에는 유효한 URI와 네트워크 접근 설정이 필요합니다.

초기 검증에서 타입 검사, 프로덕션 빌드, 자동 테스트 5개를 통과했습니다. 개발 서버와 `npm start` 양쪽에서 홈 화면 HTTP 200과 DB 미설정 시 HTTP 503 / `{"ok":false}`를 확인했고, 브라우저용 정적 JS에 DB URI·드라이버 코드가 포함되지 않는지 검사했습니다. 자동 테스트는 DB 대역으로 연결 공유·실패 후 재시도·ping 성공·오류 응답을 검증합니다. 실제 Atlas 성공 연결과 Vercel 배포는 외부 계정 설정 후 별도로 확인해야 합니다.

## 3. Vercel 환경변수·배포 (직접 진행)

1. 이 폴더를 Git 저장소에 올립니다. `.env.local`이 커밋되지 않는지 확인하세요.
2. [Vercel](https://vercel.com/new)에서 저장소를 Import합니다. 모노레포라면 **Root Directory**를 `community-web`으로 지정합니다. Framework는 **Next.js**, Node.js는 **24.x**, Build Command는 `npm run build`를 사용합니다. Output Directory는 Next.js 기본값을 유지합니다.
3. **Settings → Environment Variables**에서 `MONGODB_URI`에 실제 URI를 등록합니다. 값에는 따옴표를 넣지 마세요. 사용할 **Production / Preview / Development** 환경에 각각 설정하고, Preview는 별도 개발 DB·사용자를 쓰는 편이 좋습니다.
4. 위 Atlas 네트워크 설정에서 Vercel의 접속을 허용하고 배포합니다. 변수 변경은 이후 배포에 적용되므로 기존 배포에는 **Redeploy**가 필요합니다.
5. 배포 URL의 `/`와 `/api/health/db`를 확인합니다. 환경변수 등록만으로 DB 네트워크 접근이 허용되지는 않습니다.

별도 `vercel.json`이나 `/api` 서버 프로젝트는 필요 없습니다. Next.js Route Handler가 Vercel 함수로 배포됩니다.

## 서버 경계·연결 재사용

- `MONGODB_URI`는 서버에서만 읽습니다. `NEXT_PUBLIC_` 접두사를 붙이거나 `next.config`의 `env`, 클라이언트 props, 응답, 로그에 복사하지 마세요.
- DB 모듈은 `server-only`로 보호합니다. Client Component에서 가져오면 빌드가 실패합니다.
- 한 Node.js 인스턴스에서 연결 Promise를 공유해 동시 요청과 개발 중 hot reload에 연결을 재사용합니다. 초기 연결 실패 시 캐시를 비우고 클라이언트를 닫아 다음 요청이 재시도할 수 있게 합니다. 정상 요청마다 `close()`하지 않습니다.
- 풀은 인스턴스당 최대 10개의 작업 연결로 제한합니다. 드라이버의 모니터링 연결은 별도이며, Vercel 인스턴스가 늘면 전체 연결 수도 늘어납니다. Atlas 연결 한도와 트래픽에 맞춰 조정하세요.
- 이 상태에서는 DB 상태 확인 API만 공개됩니다. 인증과 쓰기 API는 구현하지 않았습니다.

공식 문서: [Next.js 환경변수](https://nextjs.org/docs/app/guides/environment-variables), [Node.js Route 설정](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config), [MongoDB 연결 풀](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/), [Atlas 연결](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/), [Atlas IP 접근 목록](https://www.mongodb.com/docs/atlas/security/ip-access-list/), [Vercel 환경변수](https://vercel.com/docs/environment-variables).
