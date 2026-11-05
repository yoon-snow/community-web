import { test, expect } from "@playwright/test";
import { previewData, previewResource } from "../../src/lib/preview";
import writeExcelFile from "write-excel-file/node";

test.setTimeout(90_000);

test("role navigation matches the club brief and preserves the video archive", async ({
  page,
}) => {
  for (const [role, path, labels] of [
    ["guest", "/preview", ["홈", "일정", "신청", "공지"]],
    ["member", "/preview", ["홈", "일정", "출석", "내 정보"]],
    ["admin", "/preview/admin", ["홈", "게스트", "회원", "일정", "더보기"]],
  ] as const) {
    await page.goto(`${path}?role=${role}`);
    const nav = page.getByRole("navigation", { name: "주 메뉴" });
    await expect(nav.getByRole("link")).toHaveText([...labels]);
    for (const link of await nav.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: test.info().outputPath(`${role}-home.png`),
      fullPage: true,
    });
  }
  await page.goto("/preview/account?role=member");
  await page.getByRole("link", { name: "영상·재생목록" }).click();
  await expect(page.getByRole("textbox", { name: "영상 검색" })).toBeVisible();
});

for (const extension of ["csv", "xlsx"] as const) {
  test(`${extension} import previews new/merge/errors, requires confirmation and clears stale batches`, async ({
    page,
  }) => {
    const boot = { ...previewData("admin"), configured: true, preview: false };
    let committed = false;
    await page.route("**/api/club/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/club/", "");
      if (path === "admin/import/preview") {
        const payload = route.request().postDataJSON();
        expect(payload.entity).toBe("members");
        expect(payload.rows).toHaveLength(2);
        expect(payload.rows[0].phone).toBe("010-0000-0001");
        return route.fulfill({
          json: {
            batch_id: "batch-test",
            digest: "d".repeat(64),
            new: 1,
            merge: 1,
            errors: [],
          },
        });
      }
      if (path === "admin/import/commit") {
        expect(route.request().postDataJSON()).toEqual({
          batch_id: "batch-test",
          digest: "d".repeat(64),
          confirmed: true,
        });
        committed = true;
        return route.fulfill({ json: { imported: 2 } });
      }
      return route.fulfill({
        json:
          path === "bootstrap"
            ? boot
            : previewResource(path + url.search, boot),
      });
    });
    await page.goto("/admin/import");
    const rows = [
      ["external_id", "name", "phone", "joined_on", "status"],
      ["fixture-1", "신규 테스트", "010-0000-0001", "2026-01-01", "active"],
      ["fixture-2", "병합 테스트", "010-0000-0002", "2026-01-02", "active"],
    ];
    const buffer =
      extension === "csv"
        ? Buffer.from(rows.map((r) => r.join(",")).join("\n"))
        : await writeExcelFile(
            rows.map((row) => row.map((value) => ({ value, type: String }))),
          ).toBuffer();
    await page.getByLabel("Import 파일").setInputFiles({
      name: `fixture.${extension}`,
      mimeType:
        extension === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.getByRole("button", { name: "미리보기 생성" }).click();
    await expect(
      page.locator(".stat").filter({ hasText: "신규" }),
    ).toContainText("1");
    await expect(
      page.locator(".stat").filter({ hasText: "기존 병합" }),
    ).toContainText("1");
    await expect(
      page.locator(".stat").filter({ hasText: "오류" }),
    ).toContainText("0");
    await expect(
      page.getByRole("button", { name: "Import 확정" }),
    ).toBeDisabled();
    expect(committed).toBe(false);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Import 확정" }).click();
    await expect(page.getByText("Import가 완료되었습니다.")).toBeVisible();
    expect(committed).toBe(true);
    await page.getByLabel("Import 파일").setInputFiles({
      name: "unsupported.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await expect(page.locator(".form-error[role=alert]")).toContainText(
      ".xlsx 또는 .csv",
    );
    await expect(page.getByRole("button", { name: "Import 확정" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "미리보기 생성" }),
    ).toHaveCount(0);
  });
}
