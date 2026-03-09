import { expect, test } from "@playwright/test";
import { installVisualMocks } from "./helpers/mock-api";
import { primeVisualTestPage } from "./helpers/test-boot";
import { waitForStablePage } from "./helpers/wait-for-stable-page";

test.beforeEach(async ({ page }) => {
  await primeVisualTestPage(page);
  await installVisualMocks(page);
});

test("root lands on the main analyses entry", async ({ page }) => {
  await page.goto("/");
  await waitForStablePage(page, { text: "visual-smoke" });
  await expect(page.locator("main")).toContainText("visual-smoke");
});

test("analyses overview stays visually stable", async ({ page }) => {
  await page.goto("/analyses");
  await waitForStablePage(page, { text: "visual-smoke" });
  await expect(page).toHaveScreenshot("analyses-smoke.png", { fullPage: true });
});

test("new analysis entry stays visually stable", async ({ page }) => {
  await page.goto("/analyses/new");
  await waitForStablePage(page, { headingLevel1: true });
  await expect(page.getByPlaceholder("Analyst")).toHaveValue("Codex");
  await expect(page.getByPlaceholder("Client / requester")).toHaveValue("Visual QA");
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /openai\/gpt-4\.1/i }).click();
  await expect(page.locator("div.mt-2.text-sm.font-medium", { hasText: "openai/gpt-4.1" })).toBeVisible();
  await waitForStablePage(page, { headingLevel1: true });
  await expect(page).toHaveScreenshot("analyses-new-smoke.png", { fullPage: true });
});

test("settings overview stays visually stable", async ({ page }) => {
  await page.goto("/settings");
  await waitForStablePage(page, { headingLevel1: true });
  await expect(page).toHaveScreenshot("settings-smoke.png", { fullPage: true });
});

test("backend management stays visually stable", async ({ page }) => {
  await page.goto("/settings/backends");
  await waitForStablePage(page, { headingLevel1: true });
  await expect(page).toHaveScreenshot("settings-backends-smoke.png", { fullPage: true });
});

test("analysis detail report stays visually stable", async ({ page }) => {
  await page.goto("/analyses/detail?id=visual-smoke");
  await waitForStablePage(page, { text: "视觉回归主结论：Alpha 组更像一组内部一致的写作样本。" });
  await expect(page.getByText("最值得先看的证据锚点是什么？", { exact: false })).toBeVisible();
  await waitForStablePage(page, { text: "最值得先看的证据锚点是什么？" });
  await expect(page).toHaveScreenshot("analysis-detail-smoke.png", { fullPage: true });
});

test("analysis features workbench stays visually stable", async ({ page }) => {
  await page.goto("/analyses/features?id=visual-smoke");
  await waitForStablePage(page, { headingLevel1: true });
  await expect(page).toHaveScreenshot("analysis-features-smoke.png", { fullPage: true });
});
