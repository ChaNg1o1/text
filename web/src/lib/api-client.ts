import type {
  AppSettings,
  AnalysisDetail,
  AnalysisListResponse,
  AnalysisSummary,
  BackendTestResponse,
  BackendsResponse,
  CustomBackendInfo,
  CustomBackendsResponse,
  CreateAnalysisRequest,
  FeaturesResponse,
  ProgressSnapshotResponse,
  QaSuggestionsRequest,
  QaSuggestionsResponse,
  RetryAnalysisRequest,
  UpsertCustomBackendRequest,
  UploadResponse,
} from "./types";

const DEFAULT_API_ORIGIN = (
  process.env.NEXT_PUBLIC_TEXT_API_ORIGIN ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 8000;
const ANALYSIS_DETAIL_TIMEOUT_MS = 45000;
const ANALYSIS_LIST_TIMEOUT_MS = 45000;
const FEATURES_REQUEST_TIMEOUT_MS = 120000;
const BACKEND_TEST_TIMEOUT_MS = 25000;
const BACKENDS_REQUEST_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 45000;
const REQUEST_ID_HEADER = "X-Request-ID";
const DEBUG_API_FLAG = process.env.NEXT_PUBLIC_TEXT_DEBUG_API ?? "";
const TAURI_ORIGIN_RETRY_DELAYS_MS = [80, 180, 320, 500, 800] as const;
let tauriApiOriginPromise: Promise<string> | null = null;

type RuntimeWindow = Window & {
  __TEXT_API_ORIGIN__?: string;
};

function currentWindow(): RuntimeWindow | null {
  if (typeof window === "undefined") return null;
  return window as RuntimeWindow;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

function isTauriRuntime(): boolean {
  const win = currentWindow();
  if (!win) return false;
  if ("__TAURI_INTERNALS__" in win || "__TAURI__" in win) {
    return true;
  }

  const protocol = win.location?.protocol?.toLowerCase?.() ?? "";
  const hostname = win.location?.hostname?.toLowerCase?.() ?? "";
  const userAgent = win.navigator?.userAgent?.toLowerCase?.() ?? "";
  return protocol.startsWith("tauri:") || hostname === "tauri.localhost" || userAgent.includes("tauri");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isTruthyFlag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function isApiDebugEnabled(): boolean {
  if (isTruthyFlag(DEBUG_API_FLAG)) return true;
  const win = currentWindow();
  if (!win) return false;
  try {
    return isTruthyFlag(win.localStorage?.getItem("TEXT_DEBUG_API"));
  } catch {
    return false;
  }
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers ?? undefined);
}

function summarizeBody(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return `string(${body.length})`;
  if (body instanceof Blob) return `blob(${body.size})`;
  if (body instanceof URLSearchParams) return `query(${body.toString().length})`;
  if (body instanceof FormData) {
    const count = Array.from(body.entries()).length;
    return `form(${count} fields)`;
  }
  return "body";
}

function logApiDebug(
  phase: "request" | "response" | "error",
  payload: Record<string, unknown>,
): void {
  if (!isApiDebugEnabled()) return;
  const prefix = `[text/api:${phase}]`;
  if (phase === "error") {
    console.error(prefix, payload);
    return;
  }
  console.debug(prefix, payload);
}

async function fetchTauriApiOrigin(): Promise<string> {
  let lastError: unknown;
  for (const delay of TAURI_ORIGIN_RETRY_DELAYS_MS) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const origin = await invoke<string>("get_api_origin");
      const normalized = normalizeOrigin(origin);
      if (normalized) return normalized;
    } catch (error) {
      lastError = error;
    }
    await wait(delay);
  }

  throw new Error(
    `Unable to resolve desktop API origin from native runtime${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

async function resolveApiOrigin(): Promise<string> {
  const win = currentWindow();
  if (win?.__TEXT_API_ORIGIN__) {
    return normalizeOrigin(win.__TEXT_API_ORIGIN__);
  }

  if (!isTauriRuntime()) {
    return DEFAULT_API_ORIGIN;
  }

  if (!tauriApiOriginPromise) {
    tauriApiOriginPromise = fetchTauriApiOrigin()
      .then((origin) => {
        const runtimeWindow = currentWindow();
        if (runtimeWindow) {
          runtimeWindow.__TEXT_API_ORIGIN__ = origin;
        }
        return origin;
      })
      .catch((error) => {
        tauriApiOriginPromise = null;
        throw error;
      });
  }

  return tauriApiOriginPromise;
}

async function resolveApiBase(): Promise<string> {
  const origin = await resolveApiOrigin();
  return `${origin}/api/v1`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public requestId?: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let signal: AbortSignal = controller.signal;

  if (init?.signal) {
    if (typeof AbortSignal.any === "function") {
      signal = AbortSignal.any([init.signal, controller.signal]);
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestWithOptions<T>(path, init);
}

async function requestWithOptions<T>(
  path: string,
  init?: RequestInit,
  options?: {
    timeoutMs?: number;
    timeoutMessage?: string;
  },
): Promise<T> {
  const apiBase = await resolveApiBase();
  const requestId = createRequestId();
  const startedAt = nowMs();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const method = init?.method ?? "GET";
  const url = `${apiBase}${path}`;

  const headers = toHeaders(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set(REQUEST_ID_HEADER, requestId);

  logApiDebug("request", {
    requestId,
    method,
    path,
    timeoutMs,
    body: summarizeBody(init?.body),
  });

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        headers,
        ...init,
      },
      timeoutMs,
    );
  } catch (error) {
    const elapsedMs = nowMs() - startedAt;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        408,
        options?.timeoutMessage
          ?? "Request timeout. Please check whether the local API service is running.",
        requestId,
      );
    }
    logApiDebug("error", {
      requestId,
      method,
      path,
      elapsedMs: Math.round(elapsedMs),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const elapsedMs = nowMs() - startedAt;
  const responseRequestId = res.headers.get(REQUEST_ID_HEADER) ?? requestId;
  logApiDebug("response", {
    requestId: responseRequestId,
    method,
    path,
    status: res.status,
    elapsedMs: Math.round(elapsedMs),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = body.detail ?? res.statusText;
    logApiDebug("error", {
      requestId: responseRequestId,
      method,
      path,
      status: res.status,
      elapsedMs: Math.round(elapsedMs),
      detail,
    });
    throw new ApiError(res.status, detail, responseRequestId);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Upload
  uploadFiles: async (files: File[]) => {
    if (files.length === 0) {
      throw new ApiError(400, "No files provided");
    }
    const form = new FormData();
    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      form.append("files", file, relativePath || file.name);
    }
    let res: Response;
    const apiBase = await resolveApiBase();
    const requestId = createRequestId();
    const startedAt = nowMs();
    const headers = toHeaders();
    headers.set(REQUEST_ID_HEADER, requestId);
    logApiDebug("request", {
      requestId,
      method: "POST",
      path: "/upload",
      timeoutMs: UPLOAD_TIMEOUT_MS,
      body: `form(${files.length} files)`,
    });

    try {
      res = await fetchWithTimeout(
        `${apiBase}/upload`,
        { method: "POST", body: form, headers },
        UPLOAD_TIMEOUT_MS,
      );
    } catch (error) {
      const elapsedMs = nowMs() - startedAt;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(408, "Upload timeout. Please retry with a smaller dataset.", requestId);
      }
      logApiDebug("error", {
        requestId,
        method: "POST",
        path: "/upload",
        elapsedMs: Math.round(elapsedMs),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const elapsedMs = nowMs() - startedAt;
    const responseRequestId = res.headers.get(REQUEST_ID_HEADER) ?? requestId;
    logApiDebug("response", {
      requestId: responseRequestId,
      method: "POST",
      path: "/upload",
      status: res.status,
      elapsedMs: Math.round(elapsedMs),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = body.detail ?? res.statusText;
      logApiDebug("error", {
        requestId: responseRequestId,
        method: "POST",
        path: "/upload",
        status: res.status,
        elapsedMs: Math.round(elapsedMs),
        detail,
      });
      throw new ApiError(res.status, detail, responseRequestId);
    }
    return res.json() as Promise<UploadResponse>;
  },
  upload: async (file: File) => api.uploadFiles([file]),

  // Analyses
  createAnalysis: (data: CreateAnalysisRequest) =>
    request<AnalysisSummary>("/analyses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  retryAnalysis: (id: string, data: RetryAnalysisRequest) =>
    request<AnalysisSummary>(`/analyses/${id}/retry`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listAnalyses: (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    task_type?: string;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.task_type) searchParams.set("task_type", params.task_type);
    if (params?.search) searchParams.set("search", params.search);
    const qs = searchParams.toString();
    return requestWithOptions<AnalysisListResponse>(
      `/analyses${qs ? `?${qs}` : ""}`,
      undefined,
      {
        timeoutMs: ANALYSIS_LIST_TIMEOUT_MS,
        timeoutMessage:
          "Loading analysis list timed out. The local API service may still be busy; retry shortly.",
      },
    );
  },

  getAnalysis: (id: string) =>
    requestWithOptions<AnalysisDetail>(
      `/analyses/${id}`,
      undefined,
      {
        timeoutMs: ANALYSIS_DETAIL_TIMEOUT_MS,
        timeoutMessage:
          "Loading analysis detail timed out. The local API service may still be initializing or busy.",
      },
    ),
  cancelAnalysis: (id: string) => request<AnalysisSummary>(`/analyses/${id}/cancel`, { method: "POST" }),

  deleteAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: "DELETE" }),

  getFeatures: (id: string) =>
    requestWithOptions<FeaturesResponse>(
      `/analyses/${id}/features`,
      undefined,
      {
        timeoutMs: FEATURES_REQUEST_TIMEOUT_MS,
        timeoutMessage:
          "Loading features timed out. The API may be computing or loading cached vectors; retry shortly.",
      },
    ),

  // Backends
  getBackends: () =>
    requestWithOptions<BackendsResponse>(
      "/backends",
      undefined,
      {
        timeoutMs: BACKENDS_REQUEST_TIMEOUT_MS,
        timeoutMessage:
          "Loading backend list timed out. The analysis service may be busy, please retry shortly.",
      },
    ),
  getCustomBackends: () =>
    requestWithOptions<CustomBackendsResponse>(
      "/backends/custom",
      undefined,
      {
        timeoutMs: BACKENDS_REQUEST_TIMEOUT_MS,
        timeoutMessage:
          "Loading custom backends timed out. The analysis service may still be running; please retry shortly.",
      },
    ),
  upsertCustomBackend: (name: string, payload: UpsertCustomBackendRequest) =>
    request<CustomBackendInfo>(`/backends/custom/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteCustomBackend: (name: string) =>
    request<void>(`/backends/custom/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (payload: AppSettings) =>
    request<AppSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testBackend: (name: string) =>
    requestWithOptions<BackendTestResponse>(
      `/backends/${encodeURIComponent(name)}/test`,
      {
        method: "POST",
      },
      {
        timeoutMs: BACKEND_TEST_TIMEOUT_MS,
        timeoutMessage:
          "Backend connectivity test timed out. Please check the endpoint URL and network path, then retry.",
      },
    ),

  // SSE URL helper
  progressUrl: async (id: string, options?: { replay?: boolean }) => {
    const apiBase = await resolveApiBase();
    const params = new URLSearchParams();
    if (typeof options?.replay === "boolean") {
      params.set("replay", options.replay ? "1" : "0");
    }
    const qs = params.toString();
    return `${apiBase}/analyses/${encodeURIComponent(id)}/progress${qs ? `?${qs}` : ""}`;
  },
  getProgressSnapshot: (id: string) =>
    request<ProgressSnapshotResponse>(`/analyses/${encodeURIComponent(id)}/progress/snapshot`),

  qaStreamUrl: async (id: string, question: string) => {
    const apiBase = await resolveApiBase();
    const params = new URLSearchParams({ question });
    return `${apiBase}/analyses/${encodeURIComponent(id)}/qa/stream?${params.toString()}`;
  },
  getQaSuggestions: (id: string, payload?: QaSuggestionsRequest) =>
    requestWithOptions<QaSuggestionsResponse>(
      `/analyses/${encodeURIComponent(id)}/qa/suggestions`,
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
      {
        timeoutMs: BACKEND_TEST_TIMEOUT_MS,
        timeoutMessage: "Generating question suggestions timed out. Please retry.",
      },
    ),
};
