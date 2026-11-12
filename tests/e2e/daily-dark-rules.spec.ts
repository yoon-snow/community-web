import { test, expect } from "@playwright/test";
test("guest rules stay private, emergency is prominent, and dark preference survives reload", async ({
  page,
}) => {
  await page.goto("/preview?role=guest");
  await expect(page.locator(".emergency")).toContainText("운동 장소 변경 안내");
  await expect(page.locator(".urgent-excerpt")).toContainText(
    "미리보기용 예시",
  );
  await page.getByLabel("화면 테마").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".greeting h1")).toHaveCSS(
    "color",
    "rgb(241, 245, 251)",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("화면 테마").selectOption("auto");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/preview/rules?role=guest");
  await expect(page.getByText("회원 전용 회칙입니다")).toBeVisible();
  await expect(page.locator(".handbook-content")).toHaveCount(0);
  await page.goto("/preview/rules?role=member");
  await expect(page.getByRole("region", { name: "회칙 목차" })).toBeVisible();
  await expect(page.locator(".preview-rule-list li")).toHaveCount(9);
  await expect(
    page.getByRole("link", { name: "운영 앱에서 회칙 보기" }),
  ).toHaveAttribute("href", "/rules");
  await page.screenshot({
    path: test.info().outputPath("dark-handbook.png"),
    fullPage: true,
  });
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).resolves.toBe(true);
});

test("admin daily guests show personal details with age filters", async ({
  page,
}) => {
  await page.goto("/preview/admin?role=admin");
  await expect(page.getByText("오늘 · 다음 운동 게스트")).toBeVisible();
  await expect(page.locator(".daily-guest").first()).toContainText(
    "1998-01-01",
  );
  await expect(page.locator(".daily-guest").first()).toContainText("2년");
  await expect(page.locator(".brand")).toContainText("운영진 모드");
  await page.getByRole("button", { name: "확인 전 2명" }).click();
  await expect(page.locator(".daily-guest")).toHaveCount(2);
  await page.getByRole("button", { name: "입금완료 4명" }).click();
  await expect(page.locator(".daily-guest")).toHaveCount(4);
  await page.getByRole("button", { name: "신청 6명" }).click();
  await page.getByRole("button", { name: "미성년", exact: true }).click();
  await expect(page.locator(".daily-guest")).toHaveCount(0);
  await page.getByRole("button", { name: "성인", exact: true }).click();
  await expect(page.locator(".daily-guest")).toHaveCount(6);
});
