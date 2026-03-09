import { expect, type Locator, type Page } from "@playwright/test";

async function waitForLocator(locator: Locator) {
  await expect(locator).toBeVisible();
}

export async function waitForStablePage(
  page: Page,
  options?: {
    headingLevel1?: boolean;
    text?: string;
  },
) {
  await page.waitForLoadState("domcontentloaded");

  if (options?.headingLevel1) {
    await waitForLocator(page.locator("h1").first());
  }

  if (options?.text) {
    await waitForLocator(page.getByText(options.text, { exact: false }));
  }

  await page.locator("[data-slot='skeleton']").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded");
  await page.waitForFunction(() => {
    const win = window as Window & {
      __visualStableHeight?: number;
      __visualStableHeightTicks?: number;
    };
    const height = document.documentElement.scrollHeight;
    if (win.__visualStableHeight === height) {
      win.__visualStableHeightTicks = (win.__visualStableHeightTicks ?? 0) + 1;
    } else {
      win.__visualStableHeight = height;
      win.__visualStableHeightTicks = 0;
    }
    return (win.__visualStableHeightTicks ?? 0) >= 4;
  }, { polling: 120, timeout: 5_000 });
  await page.waitForTimeout(120);
}
