export default function Home() {
  return (
    <main>
      <p className="eyebrow">COMMUNITY</p>
      <h1>우리 배구 커뮤니티의 시작</h1>
      <p>Next.js · TypeScript · MongoDB 기반의 초기 환경입니다.</p>
      <section aria-labelledby="planned-features">
        <h2 id="planned-features">다음에 만들 공간</h2>
        <ul>
          <li>회원가입 · 로그인</li>
          <li>공지 · 게시글</li>
          <li>일정 · 출석</li>
        </ul>
        <p className="note">아직 기능은 구현하지 않았습니다. 환경 설정은 README를 확인하세요.</p>
      </section>
    </main>
  );
}
