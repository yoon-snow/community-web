import { test, expect } from "@playwright/test";
import { previewData, previewResource } from "../../src/lib/preview";
test("public production shell has honest setup state, PWA metadata and no private data", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("서비스 준비 중 · 데이터베이스 연결이 필요합니다."),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await expect(page.getByText("우리의 배구가")).toBeVisible();
  const boot = await request.get("/api/club/bootstrap");
  expect((await boot.json()).member).toBeNull();
  const manifest = await request.get("/manifest.webmanifest");
  const data = await manifest.json();
  expect(data.display).toBe("standalone");
  for (const icon of data.icons)
    expect((await request.get(icon.src)).ok()).toBeTruthy();
  await page.goto("/account");
  await expect(
    page.getByRole("button", { name: "이메일로 로그인" }),
  ).toBeDisabled();
  await expect(page.getByLabel("이메일", { exact: true })).toBeVisible();
  await expect(page.getByLabel("비밀번호", { exact: true })).toBeVisible();
  await expect(page.getByText("Google로 계속하기")).toHaveCount(0);
});
test("guest preview: calendar, event, 5-step application preserves answers and consent", async ({
  page,
}) => {
  await page.goto("/preview?role=guest");
  await expect(page.getByText("미리보기 · 가상 데이터")).toBeVisible();
  await page
    .getByRole("link", { name: "SpotLight와 함께 뛰어볼까요?" })
    .click();
  await page.getByRole("link", { name: "공지 확인하고 게스트 신청" }).click();
  await expect(
    page.getByRole("heading", { name: "참가 전 꼭 확인해주세요" }),
  ).toBeVisible();
  await page.getByLabel("운동 일정과 공지·필독사항을 확인했습니다.").check();
  await page.getByRole("link", { name: "게스트 신청 시작" }).click();
  await expect(page.getByRole("heading", { name: "기본 정보" })).toBeVisible();
  await page.getByLabel("이름").fill("테스트");
  await page.getByLabel("생년월일").fill("1998-01-01");
  await page.getByLabel("성별").selectOption("여성");
  await page.getByLabel("연락처").fill("01012345678");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("희망 포지션").selectOption("세터");
  await page.getByLabel("배구 경력").fill("2년");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByLabel("참여할 운동")).not.toHaveValue("");
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByLabel("배구 경력")).toHaveValue("2년");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "카카오뱅크" })).toBeVisible();
  await expect(page.getByRole("button", { name: "신청 완료" })).toBeDisabled();
});
test("member preview: RSVP counts, private activity, video empty state, navigation", async ({
  page,
}) => {
  await page.goto("/preview?role=member");
  await expect(page.getByText("게스트 예정", { exact: false })).toBeVisible();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "내 정보", exact: true })
    .click();
  await page.getByRole("link", { name: "내 회비" }).click();
  await expect(page.getByRole("heading", { name: "내 회비" })).toBeVisible();
  await expect(page.getByText("본인의 회비 정보만 표시됩니다.")).toBeVisible();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "내 정보", exact: true })
    .click();
  await page.getByRole("link", { name: "영상·재생목록", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "아직 등록된 영상이 없어요" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "영상 검색" })).toBeVisible();
});
test("admin preview: guest filter, participant share, export bottom sheet accessible", async ({
  page,
}) => {
  await page.goto("/preview/admin?role=admin");
  await expect(
    page.getByRole("heading", { name: "오늘도, 함께 빛나게" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "게스트" })
    .click();
  await expect(
    page.getByRole("button", { name: "입금확인", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "게스트 내보내기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("현재 필터 포함")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/preview/admin/roster?role=admin");
  await page.getByLabel("운동 일정").selectOption({ index: 1 });
  await expect(
    page.getByRole("button", { name: "공유하기", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".roster")).not.toContainText("010");
});
test("guest cannot open admin screen and private pages do not leak fixture information", async ({
  page,
}) => {
  await page.goto("/preview/admin?role=guest");
  await expect(
    page.getByRole("heading", { name: "운영진 권한이 필요해요" }),
  ).toBeVisible();
  await expect(page.getByText("최근 게스트 신청")).toHaveCount(0);
});
test("mobile screens have no horizontal overflow or JavaScript errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/preview?role=guest",
    "/preview/calendar?role=guest",
    "/preview/notices?role=guest",
    "/preview/account?role=member",
    "/preview/profile?role=member",
    "/preview/admin?role=admin",
    "/preview/admin/guests?role=admin",
    "/preview/admin/members?role=admin",
    "/preview/admin/dues?role=admin",
    "/preview/admin/analytics?role=admin",
    "/preview/admin/import?role=admin",
    "/preview/admin/settings?role=admin",
    "/preview/attendance?role=member",
    "/preview/admin/attendance?role=admin",
  ]) {
    await page.goto(path);
    await expect(page.locator(".skeletons")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test("S-Core Dream loads locally and role picker opens the corresponding home/navigation", async ({
  page,
}) => {
  await page.goto("/preview?role=member");
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "출석", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return (
        getComputedStyle(document.body).fontFamily.includes("S-Core Dream") &&
        Array.from(document.fonts).some(
          (f) => f.family.includes("S-Core Dream") && f.status === "loaded",
        )
      );
    }),
  ).toBeTruthy();
  await page.getByLabel("미리보기 역할").selectOption("admin");
  await expect(page).toHaveURL(/\/preview\/admin\?role=admin/);
  await expect(
    page.getByRole("heading", { name: "오늘도, 함께 빛나게" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "게스트", exact: true }),
  ).toBeVisible();
  await page.getByLabel("미리보기 역할").selectOption("guest");
  await expect(page).toHaveURL(/\/preview\?role=guest/);
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "공지", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /우리의 배구가/ }),
  ).toBeVisible();
});

test("member sees only 18/4/22 aggregate counts and receives no guest or roster notifications", async ({
  page,
}) => {
  await page.goto("/preview?role=member");
  const counts = page.locator(".participation .count-row");
  await expect(counts.locator("b")).toHaveText(["18", "4", "22"]);
  await expect(counts).toContainText("회원 참석 예정");
  await expect(counts).toContainText("게스트 예정");
  await expect(counts).toContainText("예상 참가 인원");
  await expect(page.getByText(/첫방문|다시온|스파이크|구력/)).toHaveCount(0);
  await page.locator(".event-card.featured").click();
  await expect(page.locator(".participation .count-row b")).toHaveText([
    "18",
    "4",
    "22",
  ]);
  await expect(page.getByText(/첫방문|다시온|스파이크|구력/)).toHaveCount(0);
  await page.goto("/preview/notifications?role=member");
  await expect(
    page.getByRole("heading", { name: "알림", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/게스트 신청이 들어왔습니다|참가자 명단이 준비되었습니다/),
  ).toHaveCount(0);
  await page.goto("/preview/admin/roster?role=member");
  await expect(
    page.getByRole("heading", { name: "운영진 권한이 필요해요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "공유하기", exact: true }),
  ).toHaveCount(0);
});

test("admin guest summary remains 6/4/2 while payment filters show the matching applicants", async ({
  page,
}) => {
  await page.goto("/preview/admin/guests?role=admin");
  const summary = page.getByLabel("게스트 신청 집계");
  await expect(summary.locator("b")).toHaveText(["6", "4", "2"]);
  await expect(page.locator(".guest-card")).toHaveCount(6);
  await page.getByRole("button", { name: "입금완료", exact: true }).click();
  await expect(page.locator(".guest-card")).toHaveCount(4);
  await expect(summary.locator("b")).toHaveText(["6", "4", "2"]);
  await page.getByRole("button", { name: "입금확인 전", exact: true }).click();
  await expect(page.locator(".guest-card")).toHaveCount(2);
  await page.locator(".guest-card .name-button").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("포지션:");
  await expect(dialog).toContainText("구력:");
  await expect(dialog).toContainText("신청 일시:");
  await expect(dialog).toContainText("입금 상태: 입금확인 전");
});

test("admin notifications deep link to the exact guest application and paid-only share roster", async ({
  page,
}) => {
  await page.goto("/preview/notifications?role=admin");
  await page
    .locator(".notification-card")
    .filter({ hasText: "게스트 신청이 들어왔습니다." })
    .click();
  await expect(page).toHaveURL(/\/preview\/admin\/guests\?application=/);
  await expect(page.getByRole("dialog")).toContainText("첫방문");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto("/preview/notifications?role=admin");
  await page
    .locator(".notification-card")
    .filter({ hasText: "오늘 SpotLight 참가자 명단이 준비되었습니다." })
    .click();
  await expect(page).toHaveURL(/\/preview\/admin\/roster\?event=/);
  await expect(page.locator(".roster")).toContainText("게스트 4명");
  await expect(page.locator(".roster")).not.toContainText("첫방문");
  await expect(page.locator(".roster")).not.toContainText("다시온");
  await expect(
    page.getByRole("button", { name: "공유하기", exact: true }),
  ).toBeVisible();
});

test("emergency notice is first on Guest/Member home and notice audience filters stay separate", async ({
  page,
}) => {
  for (const role of ["guest", "member"]) {
    await page.goto(`/preview?role=${role}`);
    await expect(page.locator(".content > :first-child")).toHaveClass(
      "emergency",
    );
    await expect(page.locator(".emergency")).toContainText(
      "운동 장소 변경 안내",
    );
    await page.goto(`/preview/notices?role=${role}`);
    await expect(page.locator(".notice-card").first()).toContainText("긴급");
    await expect(
      page.getByText("운영진 전용 공지", { exact: true }),
    ).toHaveCount(0);
    if (role === "guest")
      await expect(
        page.getByText("회원 전용 공지", { exact: true }),
      ).toHaveCount(0);
    else
      await expect(
        page.getByText("회원 전용 공지", { exact: true }),
      ).toBeVisible();
    await page.getByRole("button", { name: "필독", exact: true }).click();
    await expect(page.locator(".notice-card")).toHaveCount(1);
    await expect(page.locator(".notice-card")).toContainText("필독");
  }
});

test("calendar date reveals details and emergency red marker; admin calendar keeps operations navigation and editor", async ({
  page,
}) => {
  await page.goto("/preview/calendar?role=guest");
  await expect(page.locator(".calendar-dots .cancelled").first()).toBeVisible();
  const heading = page.locator(".calendar-heading h2");
  const original = await heading.innerText();
  await page.getByRole("button", { name: "다음 달", exact: true }).click();
  await expect(heading).not.toHaveText(original);
  await page.getByRole("button", { name: "이전 달", exact: true }).click();
  await expect(heading).toHaveText(original);
  await page
    .locator('.calendar-grid button[aria-label*="긴급 변경"]')
    .first()
    .click();
  await expect(page.locator(".day-event-description").first()).toBeVisible();
  await expect(page.locator(".day-event-description").first()).toContainText(
    "게스트 신청 가능",
  );
  await expect(page.locator(".urgent-event").first()).toContainText("게임데이");
  await expect(page.getByRole("button", { name: "일정 추가" })).toHaveCount(0);
  await page.goto("/preview/admin/calendar?role=admin");
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "게스트", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "일정 추가" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("긴급 변경 · 캘린더에 빨간색으로 표시").check();
  await expect(
    page.getByRole("textbox", { name: /^긴급 변경 안내/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .locator('.calendar-grid button[aria-label*="긴급 변경"]')
    .first()
    .click();
  await page.locator(".urgent-event").first().click();
  await expect(page).toHaveURL(/\/preview\/admin\/events\//);
  await expect(page.getByText("일정 종류", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "일정 수정", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("운동 일정 수정");
  await expect(
    page.getByRole("textbox", { name: /^긴급 변경 안내/ }),
  ).toHaveValue("체육관 변경 안내 · 미리보기 예시입니다.");
});

test("admin notice editor retains four notice types, publication window, revision history and deletion", async ({
  page,
}) => {
  await page.goto("/preview/admin/notices?role=admin");
  await page.getByRole("button", { name: "수정", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "유형", exact: true }),
  ).toHaveValue("required");
  await dialog
    .getByRole("combobox", { name: "유형", exact: true })
    .selectOption("emergency");
  await expect(
    dialog.getByRole("combobox", { name: "공개 대상", exact: true }),
  ).toHaveValue("public");
  await expect(
    dialog.getByLabel("게시 시작 · 한국 시간 (비우면 즉시)"),
  ).toBeVisible();
  await expect(dialog.getByLabel("게시 종료 · 한국 시간 (선택)")).toBeVisible();
  await dialog.getByText("공지 수정 이력 · 현재 v1", { exact: true }).click();
  await expect(dialog.getByText(/v1 ·/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "삭제하기" })).toBeVisible();
});

test("changed notices require renewed consent and the submitted receipt carries the confirmed version", async ({
  page,
}) => {
  const original = previewData("guest");
  const event = original.events[0];
  const notice = original.announcements.find((n) => n.kind === "required")!;
  let version = 1;
  const submitted: Array<{ announcement_versions: Record<string, number> }> =
    [];
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({
      json: {
        ...original,
        preview: false,
        configured: true,
        acceptingApplications: true,
      },
    }),
  );
  await page.route("**/api/club/guest-guidance*", (route) =>
    route.fulfill({
      json: {
        event,
        announcements: [
          { ...notice, version, content: `버전 ${version} 참가 안내` },
        ],
      },
    }),
  );
  await page.route("**/api/club/guest-applications", async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        receipt: "confirmed-notices",
        event,
        payment: { amount: event.guest_fee, status: "pending" },
        bank: original.bank,
        depositor_name: "테스트",
        self_reported_paid: false,
      },
    });
  });
  await page.goto(`/apply?event=${event.id}`);
  await page.getByLabel("이름").fill("테스트");
  await page.getByLabel("생년월일").fill("1998-01-01");
  await page.getByLabel("성별").selectOption("여성");
  await page.getByLabel("연락처").fill("01012345678");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("희망 포지션").selectOption("세터");
  await page.getByLabel("배구 경력").fill("2년");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "입금 및 확인", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("운영진의 실제 입금 확인 후 확정됨을 이해했습니다.")
    .check();
  version = 2;
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/club/guest-guidance") && r.ok(),
    ),
    page.getByRole("button", { name: "새로고침", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "신청 완료", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "안내 및 동의", exact: true }),
  ).toBeVisible();
  expect(submitted).toHaveLength(0);
  await expect(
    page.getByLabel("게스트 참가 규정·회칙을 확인하고 동의합니다. (필수)"),
  ).not.toBeChecked();
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "신청 완료", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "게스트 신청 완료", exact: true }),
  ).toBeVisible();
  expect(submitted).toHaveLength(1);
  expect(submitted[0].announcement_versions[notice.id]).toBe(2);
  expect((submitted[0] as any).notice_consent).toBe(true);
  expect(Object.keys((submitted[0] as any).question_versions)).toHaveLength(15);
  await expect(page.getByText("현재 입금 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("입금확인 전", { exact: true })).toBeVisible();
  await expect(
    page.getByText("입금자명: 테스트", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(new RegExp(original.bank.account))).toBeVisible();
  await expect(
    page.getByText(`${event.guest_fee.toLocaleString()}원`, { exact: true }),
  ).toBeVisible();
});

test("admin questionnaire editor preserves basic fields and creates/edits/archives extra questions", async ({
  page,
}) => {
  const original = previewData("admin");
  let questions = structuredClone(original.questions) as any[];
  const writes: Array<{ method: string; body: any }> = [];
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({
      json: {
        ...original,
        questions,
        configured: true,
        preview: false,
        acceptingApplications: true,
      },
    }),
  );
  await page.route("**/api/club/admin/questions**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: questions });
    const body = route.request().postDataJSON();
    writes.push({ method, body });
    const id = route.request().url().split("/").at(-1);
    if (method === "POST")
      questions.push({
        ...body,
        id: "bbbbbbbb-1111-4111-8111-111111111111",
        version: 1,
        is_system: false,
      });
    if (method === "PATCH")
      questions = questions.map((q) =>
        q.id === id ? { ...q, ...body, version: q.version + 1 } : q,
      );
    if (method === "DELETE") questions = questions.filter((q) => q.id !== id);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: /^이름 게스트/ }).click();
  let modal = page.getByRole("dialog");
  await expect(modal.locator('[name="form"]')).toBeDisabled();
  await expect(modal.locator('[name="key"]')).toHaveAttribute("readonly", "");
  await expect(
    modal.getByRole("button", { name: "추가 질문 삭제" }),
  ).toHaveCount(0);
  await modal.locator('[name="label"]').fill("신청자 성함");
  await modal
    .locator('[name="help_text"]')
    .fill("입금자명과 같게 작성해주세요.");
  await modal.getByRole("button", { name: "저장", exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(writes[0].method).toBe("PATCH");
  expect(writes[0].body.form).toBe("guest");
  expect(writes[0].body.type).toBe("text");
  expect(writes[0].body.required).toBe(true);
  await expect(
    page.getByRole("button", { name: /^신청자 성함 게스트/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "추가 질문 등록", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal.locator('[name="key"]').fill("transport");
  await modal.locator('[name="label"]').fill("교통편");
  await modal.locator('[name="type"]').selectOption("select");
  await modal.locator('[name="options"]').fill("도보\n차량");
  await modal.locator('[name="required"]').check();
  await modal.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^교통편 게스트/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^교통편 게스트/ }).click();
  await modal.locator('[name="label"]').fill("도착 교통편");
  await modal.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^도착 교통편 게스트/ }),
  ).toBeVisible();
  await page.goto("/apply");
  await expect(page.getByLabel("신청자 성함")).toBeVisible();
  await expect(page.getByText("입금자명과 같게 작성해주세요.")).toBeVisible();
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: /^도착 교통편 게스트/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "추가 질문 삭제" })
    .click();
  await expect(
    page.getByRole("button", { name: /^도착 교통편 게스트/ }),
  ).toHaveCount(0);
  expect(writes.map((w) => w.method)).toEqual([
    "PATCH",
    "POST",
    "PATCH",
    "DELETE",
  ]);
});

test("member home uses private aggregate summary and supports all three RSVP states", async ({
  page,
}) => {
  const original = previewData("member");
  const event = original.events[0];
  let response = "unanswered";
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({ json: { ...original, configured: true, preview: false } }),
  );
  await page.route("**/api/club/me", (route) =>
    route.fulfill({
      json: {
        attendance: [],
        payments: [],
        uniform: null,
        summary: {
          year_attendance: 42,
          month_attendance: 7,
          last_attended_at: original.events.at(-1)!.starts_at,
          current_month_payment: { status: "paid", amount: 60000 },
        },
      },
    }),
  );
  await page.route(`**/api/club/events/${event.id}`, (route) =>
    route.fulfill({
      json: {
        event,
        response,
        counts: { members: 18, guests: 4, total: 22 },
        videos: [],
      },
    }),
  );
  await page.route("**/api/club/rsvp", async (route) => {
    response = route.request().postDataJSON().response;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await expect(page.locator(".stats")).toContainText("42");
  await expect(page.locator(".stats")).toContainText("7");
  await expect(page.locator(".stats")).toContainText("납부완료");
  await expect(
    page.getByRole("button", { name: "미응답", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "참석", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "참석 중", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "불참", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "불참 중", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "미응답", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "미응답", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("profile saves gallery photos immediately and name requests become effective only after admin review", async ({
  page,
}) => {
  const original = previewData("member");
  let member = { ...original.member! };
  let admin = false;
  let requests: any[] = [];
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJZkAAAAASUVORK5CYII=";
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({
      json: {
        ...original,
        member,
        role: admin ? "admin" : "member",
        titles: admin ? ["총무", "게스트 담당"] : [],
        configured: true,
        preview: false,
      },
    }),
  );
  await page.route("**/api/club/me", (route) =>
    route.fulfill({
      json: {
        attendance: [],
        payments: [],
        uniform: {
          nickname: "스포트",
          number: "07",
          top_size: "100",
          bottom_size: "95",
        },
        summary: {
          year_attendance: 0,
          month_attendance: 0,
          last_attended_at: null,
          current_month_payment: null,
        },
      },
    }),
  );
  await page.route("**/api/club/avatar", async (route) => {
    if (route.request().method() === "POST")
      member = {
        ...member,
        avatar_path: "own/photo.png" as any,
        avatar_url: image as any,
      };
    else member = { ...member, avatar_path: null, avatar_url: null };
    await route.fulfill({ json: { path: member.avatar_path } });
  });
  await page.route("**/api/club/name-requests", async (route) => {
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      requests = [
        {
          id: "aaaaaaaa-2222-4222-8222-222222222222",
          member_id: member.id,
          previous_name: member.name,
          requested_name: data.name,
          reason: data.reason,
          status: "pending",
          submitted_at: new Date().toISOString(),
        },
      ];
    }
    await route.fulfill({
      json:
        route.request().method() === "GET" ? requests : { id: requests[0].id },
    });
  });
  await page.route("**/api/club/admin/name-requests", (route) =>
    route.fulfill({ json: requests.filter((r) => r.status === "pending") }),
  );
  await page.route("**/api/club/admin/name-requests/review", async (route) => {
    const data = route.request().postDataJSON();
    requests = requests.map((r) => ({
      ...r,
      status: data.status,
      review_note: data.note,
    }));
    if (data.status === "approved")
      member = { ...member, name: requests[0].requested_name };
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/club/admin/applications", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/club/admin/members?*", (route) =>
    route.fulfill({ json: { rows: [], total: 0 } }),
  );
  await page.goto("/profile");
  await expect(page.getByText("1998-01-01", { exact: true })).toBeVisible();
  await expect(page.getByText("스포트 · 07번", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  await page.getByLabel("프로필 사진 선택").setInputFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: Buffer.from(image.split(",")[1], "base64"),
  });
  await expect(page.locator(".profile-photo img")).toHaveAttribute(
    "src",
    image,
  );
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await expect(page.locator(".profile-photo img")).toHaveCount(0);
  await expect(page.locator(".profile-photo .avatar")).toHaveText("스");
  await page.getByRole("button", { name: "이름 변경 요청하기" }).click();
  await page.getByLabel("변경할 이름").fill("새 이름");
  await page.getByLabel("변경 사유").fill("표기 변경");
  await page
    .locator("form")
    .filter({ has: page.locator('input[name="name"]') })
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    page.getByText("검토 중인 이름 변경 요청이 있습니다."),
  ).toBeVisible();
  expect(member.name).toBe(original.member!.name);
  admin = true;
  await page.goto("/admin/members");
  await page.getByLabel("이름 변경 검토 안내").fill("본인 확인 완료");
  await page
    .getByRole("button", { name: "이름 변경 승인", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "이름 변경 승인", exact: true }),
  ).toHaveCount(0);
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "새 이름", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("직책·역할: 총무 · 게스트 담당")).toBeVisible();
  await expect(page.getByText("본인 확인 완료", { exact: true })).toBeVisible();
  expect(member.id).toBe(original.member!.id);
});

test("membership form records guest participation and payment response, then shows hold/rejection before activation", async ({
  page,
}) => {
  const original = previewData("guest");
  let application: any = null;
  let approved = false;
  let submitted: any;
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({
      json: {
        ...original,
        user: {
          id: "aaaaaaaa-3333-4333-8333-333333333333",
          email: "test@example.invalid",
        },
        member: approved ? previewData("member").member : null,
        role: approved ? "member" : "guest",
        application,
        configured: true,
        preview: false,
        acceptingApplications: true,
      },
    }),
  );
  await page.route("**/api/club/membership", async (route) => {
    submitted = route.request().postDataJSON();
    application = { id: "new-application", status: "pending", review_note: "" };
    await route.fulfill({ status: 201, json: { id: application.id } });
  });
  await page.route("**/api/club/me", (route) =>
    route.fulfill({
      json: {
        attendance: [],
        payments: [],
        uniform: null,
        summary: {
          year_attendance: 0,
          month_attendance: 0,
          last_attended_at: null,
          current_month_payment: null,
        },
      },
    }),
  );
  await page.route("**/api/club/events/*", (route) =>
    route.fulfill({
      json: {
        event: original.events[0],
        response: "unanswered",
        counts: { members: 0, guests: 0, total: 0 },
        videos: [],
      },
    }),
  );
  await page.goto("/join");
  await page.getByLabel("이름").fill("가입 테스트");
  await page.getByLabel("생년월일").fill("1999-02-03");
  await page.getByLabel("성별").selectOption("여성");
  await page.getByLabel("연락처").fill("01090909090");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("희망 포지션").selectOption("리베로");
  await page.getByLabel("배구 경력").fill("2년");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("당월 게스트 참여 여부").selectOption("yes");
  await page
    .getByLabel("당월 게스트 참여 내역")
    .fill("이번 달 1회, 게스트비 입금");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("가입비 및 회비 입금 여부").selectOption("yes");
  await page
    .getByLabel("운영진의 실제 입금 확인 후 확정됨을 이해했습니다.")
    .check();
  await page.getByRole("button", { name: "신청 완료", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "가입 신청 현황", exact: true }),
  ).toBeVisible();
  expect(submitted.current_month_guest_participated).toBe(true);
  expect(submitted.self_reported_paid).toBe(true);
  for (const status of ["hold", "rejected"]) {
    application = {
      ...application,
      status,
      review_note: "본인 확인이 필요합니다.",
    };
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name:
          status === "hold"
            ? "가입 신청이 보류되었습니다."
            : "가입 신청이 거절되었습니다.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("본인 확인이 필요합니다.", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: "출석", exact: true }),
    ).toHaveCount(0);
  }
  approved = true;
  application = null;
  await page.goto("/");
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "출석", exact: true }),
  ).toBeVisible();
});

test("admin home shows five participation totals, task links and exactly five recent guests; member details include yearly attendance and dues", async ({
  page,
}) => {
  await page.goto("/preview/admin?role=admin");
  const totals = page.getByLabel("관리자 참가 현황");
  await expect(totals).toContainText("회원 참석 예정");
  await expect(totals).toContainText("게스트 전체 신청");
  await expect(totals).toContainText("게스트 입금완료");
  await expect(totals).toContainText("게스트 입금확인 전");
  await expect(totals).toContainText("전체 예상 참가 인원");
  await expect(page.locator(".guest-card")).toHaveCount(5);
  await expect(page.locator(".task-list a")).toHaveCount(4);
  await expect(page.locator(".guest-card").first()).toContainText("성별");
  await expect(page.locator(".guest-card").first()).toContainText(
    "01000000000",
  );
  await page.goto("/preview/admin/members?role=admin");
  await page.locator("button.list-card").filter({ hasText: "스포트" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("올해 출석");
  await expect(modal).toContainText("최근 참석");
  await expect(modal).toContainText("이번 달 회비");
  await expect(modal.locator('[name="birth_date"]')).toHaveValue("1998-01-01");
  await expect(modal.locator('[name="phone"]')).toHaveValue("01000000000");
  await expect(modal.getByLabel("운영진 메모 · 회원 비공개")).toBeVisible();
});

test("member monthly attendance is read-only, switches years and renders confirmed counts", async ({
  page,
}) => {
  const boot = previewData("member");
  const year = Number(
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      .slice(0, 4),
  );
  const report = {
    summary: {
      year,
      year_attendance: 4,
      last_attended_at: boot.events.at(-1)!.starts_at,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        count: i === 0 ? 4 : 0,
      })),
    },
    rows: [
      {
        id: "record",
        member_id: boot.member!.id,
        response: "yes",
        actual: true,
        events: boot.events.at(-1),
      },
    ],
    total: 1,
  };
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({ json: { ...boot, configured: true, preview: false } }),
  );
  await page.route("**/api/club/my-attendance?*", (route) => {
    const y = Number(new URL(route.request().url()).searchParams.get("year"));
    return route.fulfill({
      json:
        y === year
          ? report
          : {
              ...report,
              summary: {
                ...report.summary,
                year: y,
                year_attendance: 0,
                months: report.summary.months.map((m) => ({ ...m, count: 0 })),
              },
              rows: [],
              total: 0,
            },
    });
  });
  await page.goto("/attendance");
  await expect(page.getByLabel("월별 실제 출석").locator("dd")).toHaveText([
    "4회",
    ...Array(11).fill("0회"),
  ]);
  await expect(page.getByText("출석 확정", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "출석 확인", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("출석 연도").selectOption(String(year - 1));
  await expect(page.getByText("이 연도의 출석 기록이 없어요")).toBeVisible();
});

test("admin attendance disables early confirmation, preserves RSVP while checking attendance and offers per-member history", async ({
  page,
}) => {
  const original = previewData("admin");
  const future = original.events[0],
    past = original.events.at(-1)!;
  const boot = {
    ...original,
    events: [future, past],
    configured: true,
    preview: false,
  };
  const members = [
    { ...original.member!, name: "참석회원" },
    {
      ...original.member!,
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      name: "미응답회원",
    },
  ];
  let actual: boolean | null = null;
  const writes: any[] = [];
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({ json: boot }),
  );
  await page.route("**/api/club/admin/attendance?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const event = q.get("event") === future.id ? future : past;
    const rows = [
      { member_id: members[0].id, response: "yes", actual: null },
      {
        member_id: members[1].id,
        response: "unanswered",
        actual: event.id === past.id ? actual : null,
      },
    ];
    const list = members.filter(
      (m) =>
        q.get("response") === "all" ||
        rows.find((a) => a.member_id === m.id)?.response === q.get("response"),
    );
    return route.fulfill({
      json: {
        event,
        members: list,
        attendance: rows,
        total: list.length,
        summary: { members: 2, present: actual === true ? 1 : 0 },
      },
    });
  });
  await page.route("**/api/club/admin/attendance", async (route) => {
    const data = route.request().postDataJSON();
    writes.push(data);
    actual = data.actual;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/club/admin/members?*", (route) =>
    route.fulfill({ json: { rows: members, total: members.length } }),
  );
  await page.route("**/api/club/admin/attendance-report?*", (route) =>
    route.fulfill({
      json: previewResource(
        `my-attendance?year=${new Date().getFullYear()}`,
        original,
      ),
    }),
  );
  await page.goto(`/admin/attendance?event=${future.id}&response=unanswered`);
  await expect(
    page.getByRole("button", { name: "출석 확인", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("미응답회원", { exact: true })).toBeVisible();
  await expect(page.getByText("참석회원", { exact: true })).toHaveCount(0);
  await page.getByLabel("운동 선택").selectOption(past.id);
  await page.getByRole("button", { name: "출석 확인", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "출석", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("세터 · 미응답", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "불참 확인", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "불참 확인", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(writes.map((w) => w.actual)).toEqual([true, false]);
  await page
    .getByRole("button", { name: "회원별 출석 기록", exact: true })
    .click();
  await page.getByLabel("선택할 회원").selectOption(members[0].id);
  await expect(page.getByLabel("월별 실제 출석")).toBeVisible();
});

test("dues filters and current-month unpaid shortcut stay scoped, and admin can record paid status", async ({
  page,
}) => {
  const memberRow = (name: string) =>
    page
      .locator("button.list-card")
      .filter({ has: page.getByText(name, { exact: true }) });
  const boot = previewData("admin");
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const members = ["납부회원", "미납회원", "면제회원"].map((name, i) => ({
    ...boot.member!,
    name,
    id: `aaaaaaa${i}-1111-4111-8111-111111111111`,
  }));
  let payments = members.map((m, i) => ({
    id: m.id,
    member_id: m.id,
    members: m,
    month: month + "-01",
    amount: 60000,
    status: ["paid", "unpaid", "exempt"][i],
  }));
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({ json: { ...boot, configured: true, preview: false } }),
  );
  await page.route("**/api/club/admin/dues?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: payments.filter(
        (p) =>
          p.month.startsWith(q.get("month")!) &&
          (!q.get("member") || p.member_id === q.get("member")) &&
          (q.get("status") === "all" || p.status === q.get("status")),
      ),
    });
  });
  await page.route("**/api/club/admin/dues-summary?*", (route) =>
    route.fulfill({
      json: {
        paid: payments.filter((p) => p.status === "paid").length,
        unpaid: payments.filter((p) => p.status === "unpaid").length,
        exempt: payments.filter((p) => p.status === "exempt").length,
        unregistered: 0,
      },
    }),
  );
  await page.route("**/api/club/admin/members?*", (route) =>
    route.fulfill({ json: { rows: members, total: members.length } }),
  );
  await page.route("**/api/club/admin/dues", async (route) => {
    const data = route.request().postDataJSON();
    payments = payments.map((p) =>
      p.member_id === data.member_id ? { ...p, ...data } : p,
    );
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/admin/dues?month=2024-01&member=${members[0].id}`);
  await page
    .getByRole("button", { name: "이번 달 미납자 보기", exact: true })
    .click();
  await expect(page.getByLabel("회비 월")).toHaveValue(month);
  await expect(memberRow("미납회원")).toBeVisible();
  await expect(memberRow("납부회원")).toHaveCount(0);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.locator("button.list-card")).toHaveCount(3);
  await page.getByRole("button", { name: "면제", exact: true }).click();
  await expect(memberRow("면제회원")).toBeVisible();
  await page.getByRole("button", { name: "미납", exact: true }).click();
  await memberRow("미납회원").click();
  await page.getByRole("dialog").getByLabel("납부 상태").selectOption("paid");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(memberRow("미납회원")).toHaveCount(0);
  await page.getByRole("button", { name: "납부완료", exact: true }).click();
  await expect(memberRow("미납회원")).toContainText("납부완료");
});

test("local connection fallback explains stopped development server without claiming the internet is offline", async ({
  page,
}) => {
  await page.goto("/offline.html");
  await expect(
    page.getByRole("heading", { name: "개발 서버에 연결할 수 없어요" }),
  ).toBeVisible();
  await expect(
    page.getByText(/인터넷이 연결되어 있어도 서버가 꺼지면/),
  ).toBeVisible();
  await page.getByRole("link", { name: "다시 연결하기" }).click();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
});

test("email signin shows a generic error then loads the approved member home without social login", async ({
  page,
}) => {
  let signedIn = false;
  let attempts = 0;
  const payloads: any[] = [];
  const boot = () => ({
    ...previewData(signedIn ? "member" : "guest"),
    configured: true,
    preview: false,
  });
  await page.route("**/api/club/**", (route) => {
    const data = boot();
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/club/", "") + url.search;
    return route.fulfill({
      json: path === "bootstrap" ? data : previewResource(path, data),
    });
  });
  await page.route("**/api/auth/signin", async (route) => {
    attempts++;
    payloads.push(route.request().postDataJSON());
    if (attempts === 1)
      return route.fulfill({
        status: 401,
        json: { error: "이메일 또는 비밀번호를 확인해주세요." },
      });
    signedIn = true;
    return route.fulfill({ json: { next: "/" } });
  });
  await page.goto("/account");
  await page
    .getByLabel("이메일", { exact: true })
    .fill("member@example.invalid");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-2026");
  await page
    .getByRole("button", { name: "이메일로 로그인", exact: true })
    .click();
  await expect(page.locator(".login-card").getByRole("alert")).toContainText(
    "이메일 또는 비밀번호",
  );
  await page
    .getByRole("button", { name: "이메일로 로그인", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "출석", exact: true }),
  ).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(Object.keys(payloads[1]).sort()).toEqual(["email", "password"]);
  expect(page.url()).not.toContain("password");
});

test("own account signup and reset-email forms validate confirmation and send separate credential-free reset requests", async ({
  page,
}) => {
  const boot = { ...previewData("guest"), configured: true, preview: false };
  const signups: any[] = [];
  const resets: any[] = [];
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({ json: boot }),
  );
  await page.route("**/api/auth/signup", async (route) => {
    signups.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: { message: "확인 메일을 확인한 뒤 로그인해주세요." },
    });
  });
  await page.route("**/api/auth/request-reset", async (route) => {
    resets.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        message: "가입된 계정이 있다면 비밀번호 재설정 메일이 발송됩니다.",
      },
    });
  });
  await page.goto("/account");
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await page.getByLabel("이메일", { exact: true }).fill("new@example.invalid");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-2026");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "계정 생성하기", exact: true })
    .click();
  await expect(page.locator(".login-card").getByRole("alert")).toHaveText(
    "비밀번호가 서로 다릅니다.",
  );
  expect(signups).toHaveLength(0);
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("test-password-2026");
  await page
    .getByRole("button", { name: "계정 생성하기", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("확인 메일");
  expect(signups).toHaveLength(1);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page
    .getByRole("button", { name: "비밀번호 재설정", exact: true })
    .click();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await page.getByLabel("이메일", { exact: true }).fill("new@example.invalid");
  await page
    .getByRole("button", { name: "재설정 메일 보내기", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("가입된 계정이 있다면");
  expect(resets).toEqual([{ email: "new@example.invalid" }]);
});

test("recovery page requires a verified user and successful password change returns to own login", async ({
  page,
}) => {
  let signedIn = true;
  const updates: any[] = [];
  await page.route("**/api/club/bootstrap", (route) =>
    route.fulfill({
      json: {
        ...previewData(signedIn ? "member" : "guest"),
        configured: true,
        preview: false,
      },
    }),
  );
  await page.route("**/api/auth/update-password", async (route) => {
    updates.push(route.request().postDataJSON());
    signedIn = false;
    await route.fulfill({ json: { next: "/account?password=updated" } });
  });
  await page.goto("/reset-password");
  await page
    .getByLabel("새 비밀번호", { exact: true })
    .fill("new-test-password-2026");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("new-test-password-2026");
  await page
    .getByRole("button", { name: "비밀번호 저장", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account\?password=updated$/);
  await expect(page.getByRole("status")).toContainText("새 비밀번호로 로그인");
  await expect(
    page.getByRole("button", { name: "이메일로 로그인", exact: true }),
  ).toBeVisible();
  expect(Object.keys(updates[0]).sort()).toEqual([
    "password",
    "password_confirm",
  ]);
  await page.goto("/reset-password");
  await expect(
    page.getByRole("button", { name: "비밀번호 저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "재설정 메일 다시 요청하기", exact: true })
    .click();
  await expect(page.getByLabel("이메일", { exact: true })).toBeVisible();
});

test("paid-only roster has member/guest tabs and generates privacy-safe paginated share images", async ({
  page,
}) => {
  const boot = { ...previewData("admin"), configured: true, preview: false };
  const event = boot.events[0];
  const roster = {
    event,
    members: Array.from({ length: 31 }, (_, i) => ({
      name: `회원${i + 1}`,
      position: "센터",
    })),
    guests: [{ name: "입금확인게스트", position: "세터" }],
    text: "[SpotLight 참가 명단]\n회원 31명 · 게스트 1명 · 총 32명\n입금확인게스트 / 세터",
  };
  await page.addInitScript(() => {
    (window as any).shared = [];
    Object.defineProperty(navigator, "canShare", {
      value: () => true,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: any) => {
        (window as any).shared.push({
          text: data.text,
          files: data.files?.map((f: File) => ({
            name: f.name,
            type: f.type,
            size: f.size,
          })),
        });
      },
      configurable: true,
    });
  });
  await page.route("**/api/club/bootstrap", (r) => r.fulfill({ json: boot }));
  await page.route("**/api/club/admin/roster?*", (r) =>
    r.fulfill({ json: roster }),
  );
  await page.goto(`/admin/roster?event=${event.id}`);
  await expect(page.getByRole("tabpanel")).toContainText("회원31");
  await expect(page.getByRole("tabpanel")).not.toContainText("입금확인게스트");
  await page.getByRole("tab", { name: "게스트 1", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("입금확인게스트");
  await page.getByRole("button", { name: "공유하기", exact: true }).click();
  expect(await page.evaluate(() => (window as any).shared[0].text)).toBe(
    roster.text,
  );
  await page
    .getByRole("button", { name: "이미지 카드 생성", exact: true })
    .click();
  await expect(page.getByAltText("참가자 명단 이미지 2")).toBeVisible();
  await page
    .getByRole("button", { name: "이미지 공유 2", exact: true })
    .click();
  const shared = await page.evaluate(() => (window as any).shared[1]);
  expect(shared.files[0].name).toBe("spotlight-roster-2.png");
  expect(shared.files[0].type).toBe("image/png");
  expect(shared.files[0].size).toBeGreaterThan(1000);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("member archive supports category chips, playlist counts, detail and event-linked video filtering", async ({
  page,
}) => {
  const boot = { ...previewData("member"), configured: true, preview: false };
  const event = boot.events[0];
  const entries = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      source: "videos",
      entry_type: "video",
      title: "테스트 Lesson 영상",
      kind: "lesson",
      filmed_on: "2026-10-05",
      video_id: "abcdefghijk",
      url: "https://youtu.be/abcdefghijk",
      description: "토스 연습",
      event_id: event.id,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      source: "playlists",
      entry_type: "playlist",
      title: "2026 October Game Day",
      kind: "game",
      filmed_on: "2026-10-04",
      playlist_id: "PLabcdefghijk",
      url: "https://youtube.com/playlist?list=PLabcdefghijk",
      video_count: 12,
      description: "10월 경기 모음",
      event_id: event.id,
    },
  ];
  let lastEvent = "";
  await page.route("**/api/club/**", (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.replace("/api/club/", "");
    if (path === "bootstrap") return r.fulfill({ json: boot });
    if (path === "videos") {
      lastEvent = url.searchParams.get("event") || "";
      const kind = url.searchParams.get("kind");
      const rows = entries.filter(
        (e) => !kind || kind === "all" || e.kind === kind,
      );
      return r.fulfill({ json: { rows, total: rows.length } });
    }
    if (path === `playlists/${entries[1].id}`)
      return r.fulfill({ json: { entry: entries[1], event } });
    if (path === `events/${event.id}`)
      return r.fulfill({
        json: {
          event,
          counts: { members: 18, guests: 4, total: 22 },
          videos: entries,
          attendance: [],
        },
      });
    return r.fulfill({ json: previewResource(path + url.search, boot) });
  });
  await page.goto("/videos");
  await expect(page.getByText("12 Videos")).toBeVisible();
  for (const name of ["전체", "Game Day", "Lesson", "대회", "연습", "이벤트"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lesson", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "테스트 Lesson 영상" }),
  ).toBeVisible();
  await expect(page.getByText("12 Videos")).toHaveCount(0);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page
    .getByRole("link", { name: "2026 October Game Day", exact: true })
    .click();
  await expect(page).toHaveURL(/\/playlists\//);
  await expect(page.getByText("10월 경기 모음")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "YouTube에서 보기" }),
  ).toHaveAttribute("href", entries[1].url);
  await page.getByRole("link", { name: new RegExp(event.title) }).click();
  await page.getByRole("link", { name: "이 날의 영상", exact: true }).click();
  await expect(page.getByLabel("연결 일정")).toHaveValue(event.id);
  await expect.poll(() => lastEvent).toBe(event.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("guest sees no event video section and cannot query archive details", async ({
  page,
}) => {
  const boot = { ...previewData("guest"), configured: true, preview: false };
  let archiveRequests = 0;
  await page.route("**/api/club/**", (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/api/club/", "");
    if (/^(videos|playlists)/.test(path)) archiveRequests++;
    return r.fulfill({
      json:
        path === "bootstrap" ? boot : previewResource(path + u.search, boot),
    });
  });
  await page.goto(`/events/${boot.events[0].id}`);
  await expect(
    page.getByText(boot.events[0].title, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "이 날의 영상", exact: true }),
  ).toHaveCount(0);
  await page.goto("/playlists/22222222-2222-4222-8222-222222222222");
  await expect(
    page.getByRole("button", { name: "이메일로 로그인", exact: true }),
  ).toBeVisible();
  expect(archiveRequests).toBe(0);
});

test("admin analytics charts fit mobile and Export retains month plus paid status", async ({
  page,
}) => {
  const boot = { ...previewData("admin"), configured: true, preview: false };
  let exportQuery = "";
  await page.route("**/api/club/**", (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/api/club/", "");
    if (path === "admin/export") {
      exportQuery = u.search;
      return r.fulfill({
        body: "id,status\n1,paid",
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="test.csv"' },
      });
    }
    return r.fulfill({
      json:
        path === "bootstrap" ? boot : previewResource(path + u.search, boot),
    });
  });
  await page.goto("/admin/analytics");
  for (const name of [
    "월별 신규 회원",
    "월별 평균 참가자",
    "월별 실제 참가 연인원",
    "최근 장기 미참석 회원",
  ])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath("analytics.png"),
    fullPage: true,
  });
  await page.goto("/admin/export");
  await page.getByLabel("월 · 선택", { exact: true }).fill("2026-10");
  await page.getByLabel("상태", { exact: true }).selectOption("paid");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  await page.getByText("CSV (.csv)", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "파일 생성", exact: true }).click();
  await download;
  const params = new URLSearchParams(exportQuery);
  expect(params.get("month")).toBe("2026-10");
  expect(params.get("status")).toBe("paid");
  expect(params.get("format")).toBe("csv");
});
