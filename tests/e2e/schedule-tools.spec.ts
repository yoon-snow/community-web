import { test, expect } from "@playwright/test";

test("regular workout defaults follow selected Sunday and switching kinds updates the fee", async ({
  page,
}) => {
  await page.goto("/preview/admin/calendar?role=admin");
  const sunday = page
    .locator(".calendar-grid button")
    .filter({ hasText: /^\d+$/ });
  await expect(sunday.first()).toBeVisible();
  const days = await sunday.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("aria-label")?.slice(0, 10)),
  );
  const day = days.find(
    (d) => d && new Date(d + "T12:00:00Z").getUTCDay() === 0,
  )!;
  await page.getByRole("button", { name: new RegExp("^" + day) }).click();
  await page.getByRole("button", { name: "일정 추가" }).click();
  await expect(page.getByLabel("시작 · 한국 시간")).toHaveValue(day + "T17:00");
  await expect(page.getByLabel("종료 · 한국 시간")).toHaveValue(day + "T20:00");
  await expect(page.getByLabel("장소", { exact: true })).toHaveValue(
    "광명동초등학교",
  );
  await expect(page.getByLabel("게스트 신청 허용")).toBeChecked();
  await expect(page.getByLabel("게스트비")).toHaveValue("5000");
  await page.getByLabel("종류", { exact: true }).selectOption("lesson");
  await expect(page.getByLabel("게스트비")).toHaveValue("15000");
});
