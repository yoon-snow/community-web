import { test, expect } from "@playwright/test";
test.use({ baseURL: process.env.SUPPORT_TEST_URL || "http://localhost:3000" });
test("guest finds payment help before opening a linked follow-up", async ({
  page,
}) => {
  await page.goto("/preview?role=guest");
  await page.getByRole("link", { name: "문의하기", exact: true }).click();
  await expect(page.getByLabel("문의 내용")).toHaveCount(0);
  await page.getByLabel("FAQ 검색").fill("입금");
  await page
    .getByRole("button", { name: "입금 여부는 어떻게 확인하나요?" })
    .click();
  await expect(
    page.getByText(/운영진이 실제 입금 내역을 확인하면 입금완료/),
  ).toBeVisible();
  await page.getByRole("button", { name: "추가 문의하기" }).click();
  await expect(page.getByText("게스트비 / 입금 · 확인한 FAQ")).toBeVisible();
  await expect(page.getByLabel("이름", { exact: true })).toBeVisible();
  await expect(page.getByLabel("추가 질문")).toBeVisible();
});
test("member history and admin FAQ editor are reachable from role menus", async ({
  page,
}) => {
  await page.goto("/preview/account?role=member");
  await page.getByRole("link", { name: "내 문의", exact: true }).click();
  await page.getByRole("link", { name: /입금 확인 부탁드려요/ }).click();
  await expect(page.getByRole("heading", { name: "문의 대화" })).toBeVisible();
  await page.goto("/preview/admin/more?role=admin");
  await page.getByRole("link", { name: "문의 관리" }).click();
  await expect(page.getByText("오늘 문의", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "FAQ 관리" }).click();
  await page.getByRole("button", { name: "FAQ 추가" }).click();
  await expect(page.getByLabel("자동 답변")).toBeVisible();
});
