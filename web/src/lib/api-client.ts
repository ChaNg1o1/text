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

const API_BASE = "/api/v1";

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
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
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
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
  progressUrl: (id: string) => `${API_BASE}/analyses/${id}/progress`,
};
