import useSWR from "swr";
import { api } from "@/lib/api-client";
import type { AnalysisListResponse } from "@/lib/types";

interface UseAnalysesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  taskType?: string;
  search?: string;
}

export function useAnalyses(params: UseAnalysesParams = {}) {
  const key = JSON.stringify(["analyses", params]);
  return useSWR<AnalysisListResponse>(key, () =>
    api.listAnalyses({
      page: params.page,
      page_size: params.pageSize,
      status: params.status,
      task_type: params.taskType,
      search: params.search,
    }),
  );
}
