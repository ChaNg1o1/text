import type { Page } from "@playwright/test";

const FIXED_NOW = Date.parse("2026-03-08T09:00:00.000+08:00");

export async function primeVisualTestPage(page: Page) {
  await page.addInitScript(({ fixedNow }) => {
    try {
      window.sessionStorage.setItem("welcome-shown", "1");
      window.localStorage.setItem("TEXT_DEBUG_API", "0");
    } catch {
      // Ignore storage errors in browser bootstrapping.
    }

    const RealDate = Date;

    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedNow);
          return;
        }
        super(...(args as ConstructorParameters<typeof Date>));
      }

      static now() {
        return fixedNow;
      }

      static parse(value: string) {
        return RealDate.parse(value);
      }

      static UTC(...args: Parameters<typeof Date.UTC>) {
        return RealDate.UTC(...args);
      }
    }

    Object.defineProperty(window, "Date", {
      configurable: true,
      writable: true,
      value: FixedDate,
    });
  }, { fixedNow: FIXED_NOW });
}
