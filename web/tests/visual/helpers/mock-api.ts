import type { Page, Route } from "@playwright/test";
import {
  backendsResponse,
  buildAnalysesResponse,
  completedAnalysisDetail,
  customBackendsResponse,
  featuresResponse,
  progressSnapshotResponse,
  qaSuggestionsResponse,
  settingsResponse,
} from "../fixtures/mock-data";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installVisualMocks(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (request.method() === "GET" && path === "/backends") {
      return json(route, backendsResponse);
    }

    if (request.method() === "GET" && path === "/backends/custom") {
      return json(route, customBackendsResponse);
    }

    if (request.method() === "GET" && path === "/settings") {
      return json(route, settingsResponse);
    }

    if (request.method() === "GET" && path === "/analyses") {
      return json(route, buildAnalysesResponse(url.searchParams));
    }

    if (request.method() === "GET" && path === "/analyses/visual-smoke") {
      return json(route, completedAnalysisDetail);
    }

    if (request.method() === "GET" && path === "/analyses/visual-smoke/features") {
      return json(route, featuresResponse);
    }

    if (request.method() === "GET" && path === "/analyses/visual-smoke/progress/snapshot") {
      return json(route, progressSnapshotResponse);
    }

    if (request.method() === "POST" && path === "/analyses/visual-smoke/qa/suggestions") {
      return json(route, qaSuggestionsResponse);
    }

    return json(
      route,
      {
        detail: `Unhandled visual mock for ${request.method()} ${path}`,
      },
      501,
    );
  });
}
