import type {
  AnalysisDetail,
  AnalysisListResponse,
  AnalysisSummary,
  BackendTestResponse,
  BackendsResponse,
  CustomBackendInfo,
  CustomBackendsResponse,
  CreateAnalysisRequest,
  FeaturesResponse,
  UpsertCustomBackendRequest,
  UploadResponse,
} from "./types";

const DEFAULT_API_ORIGIN = (
  process.env.NEXT_PUBLIC_TEXT_API_ORIGIN ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 45000;
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
  return "__TAURI_INTERNALS__" in win || "__TAURI__" in win;
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
    tauriApiOriginPromise = import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("get_api_origin"))
      .then((origin) => normalizeOrigin(origin))
      .catch(() => DEFAULT_API_ORIGIN)
      .then((origin) => {
        const runtimeWindow = currentWindow();
        if (runtimeWindow) {
          runtimeWindow.__TEXT_API_ORIGIN__ = origin;
        }
        return origin;
      });
  }

  return tauriApiOriginPromise;
}

async function resolveApiBase(): Promise<string> {
  const origin = await resolveApiOrigin();
  return `${origin}/api/v1`;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
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
  const apiBase = await resolveApiBase();
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${apiBase}${path}`,
      {
        headers: { "Content-Type": "application/json", ...init?.headers },
        ...init,
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(408, "Request timeout. Please check whether the local API service is running.");
    }
    throw error;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
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
    try {
      res = await fetchWithTimeout(
        `${apiBase}/upload`,
        { method: "POST", body: form },
        UPLOAD_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(408, "Upload timeout. Please retry with a smaller dataset.");
      }
      throw error;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(res.status, body.detail ?? res.statusText);
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
    return request<AnalysisListResponse>(`/analyses${qs ? `?${qs}` : ""}`);
  },

  getAnalysis: (id: string) => request<AnalysisDetail>(`/analyses/${id}`),
  cancelAnalysis: (id: string) => request<AnalysisSummary>(`/analyses/${id}/cancel`, { method: "POST" }),

  deleteAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: "DELETE" }),

  getFeatures: (id: string) => request<FeaturesResponse>(`/analyses/${id}/features`),

  // Backends
  getBackends: () => request<BackendsResponse>("/backends"),
  getCustomBackends: () => request<CustomBackendsResponse>("/backends/custom"),
  upsertCustomBackend: (name: string, payload: UpsertCustomBackendRequest) =>
    request<CustomBackendInfo>(`/backends/custom/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteCustomBackend: (name: string) =>
    request<void>(`/backends/custom/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  testBackend: (name: string) =>
    request<BackendTestResponse>(`/backends/${encodeURIComponent(name)}/test`, {
      method: "POST",
    }),

  // SSE URL helper
  progressUrl: async (id: string) => {
    const apiBase = await resolveApiBase();
    return `${apiBase}/analyses/${id}/progress`;
  },
};
