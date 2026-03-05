import useSWR from "swr";
import { ApiError, api } from "@/lib/api-client";
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
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: (error: unknown) => {
        if (error instanceof ApiError) {
          if (error.status === 400 || error.status === 422) {
            return false;
          }
          return error.status === 408 || error.status >= 500;
        }
        return true;
      },
      errorRetryCount: 3,
      errorRetryInterval: 2500,
      keepPreviousData: true,
      dedupingInterval: 4000,
    },
  );
}
