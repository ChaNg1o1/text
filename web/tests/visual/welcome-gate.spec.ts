import { expect, test } from "@playwright/test";
import { buildAnalysesResponse } from "./fixtures/mock-data";

const ANALYSES_DELAY_MS = 2500;

test("welcome handoff waits until analyses data is ready", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    try {
      window.sessionStorage.removeItem("welcome-shown");
      window.localStorage.setItem("TEXT_DEBUG_API", "0");
    } catch {
      // Ignore storage access failures in tests.
    }

    const runtimeWindow = window as Window & {
      __welcomePerf?: {
        homeReadyAt: number | null;
      };
    };
    runtimeWindow.__welcomePerf = {
      homeReadyAt: null,
    };

    window.addEventListener(
      "text:home-ready",
      () => {
        if (!runtimeWindow.__welcomePerf) return;
        runtimeWindow.__welcomePerf.homeReadyAt = performance.now();
      },
      { once: true },
    );
  });

  await page.route("**/api/v1/analyses**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ANALYSES_DELAY_MS));
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAnalysesResponse(url.searchParams)),
    });
  });

  await page.goto("/analyses?welcome=1");

  const welcome = page.locator(".welcome-screen");
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveAttribute("data-phase", "playing");
  await page.evaluate(() => {
    document.documentElement.dataset.homeGate = "true";
    document.documentElement.dataset.homeReady = "false";
    window.dispatchEvent(new Event("text:home-ready"));
  });

  await page.locator("video").evaluate((node) => {
    node.dispatchEvent(new Event("ended"));
  });

  await page.waitForTimeout(1800);
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveAttribute("data-phase", "handoff");
  await expect(page.getByText("visual-smoke", { exact: false })).toHaveCount(0);

  await expect(page.getByText("visual-smoke", { exact: false })).toBeVisible({
    timeout: 8000,
  });
  await expect(welcome).toHaveCount(0, { timeout: 5000 });

  const perf = await page.evaluate(() => {
    const runtimeWindow = window as Window & {
      __welcomePerf?: {
        homeReadyAt: number | null;
      };
    };
    return runtimeWindow.__welcomePerf ?? null;
  });

  expect(perf).not.toBeNull();
  expect(perf?.homeReadyAt).not.toBeNull();
});
