import { expect, test } from "@playwright/test";

test("members move between vote groups for the same event", async ({
  page,
}) => {
  await page.goto("/preview?role=member");
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  const panel = page.locator(".participation");
  for (const [choice, group, count] of [
    ["참석", "참석 4명", "4"],
    ["불참", "불참 2명", "3"],
    ["미응답", "미응답 2명", "3"],
  ]) {
    await panel.getByRole("button", { name: choice, exact: true }).click();
    await expect(panel.locator(".count-row b")).toHaveText(count);
    const roster = panel.locator("details");
    if ((await roster.getAttribute("open")) === null) {
      await roster.locator("summary").click();
    }
    await expect(
      roster.getByText(group, { exact: true }).locator(".."),
    ).toContainText("스포트");
  }
});

test("admins pin and unpin a notice on the member board", async ({ page }) => {
  const title = "이번 달 클럽 소식";
  const adminUrl = "/preview/admin/notices?role=admin";
  const memberUrl = "/preview/notices?role=member";
  const row = page.locator(".board-list-row").filter({ hasText: title });
  await page.goto(adminUrl);
  await row.getByRole("button", { name: "상단 고정", exact: true }).click();
  await expect(row.getByRole("button", { name: "고정 해제" })).toBeVisible();
  await page.goto(memberUrl);
  await expect(page.locator(".notice-card").first()).toContainText(title);
  await page.goto(adminUrl);
  await row.getByRole("button", { name: "고정 해제" }).click();
  await expect(
    row.getByRole("button", { name: "상단 고정", exact: true }),
  ).toBeVisible();
  await page.goto(memberUrl);
  await expect(page.locator(".notice-card").first()).not.toContainText(title);
  await expect(
    page.locator(".notice-card").filter({ hasText: title }),
  ).toBeVisible();
});
