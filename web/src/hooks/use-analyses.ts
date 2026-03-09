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
  const key = ["analyses", params] as const;
  return useSWR<AnalysisListResponse, ApiError, typeof key>(
    key,
    ([, requestParams]) =>
      api.listAnalyses({
        page: requestParams.page,
        page_size: requestParams.pageSize,
        status: requestParams.status,
        task_type: requestParams.taskType,
        search: requestParams.search,
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
      onErrorRetry: (error, _key, _config, revalidate, options) => {
        if (!(error instanceof ApiError)) {
          window.setTimeout(() => revalidate(options), Math.min(300 * 2 ** options.retryCount, 1200));
          return;
        }
        if (error.status === 408 || error.status >= 500) {
          window.setTimeout(() => revalidate(options), Math.min(450 * 2 ** options.retryCount, 1800));
        }
      },
      keepPreviousData: true,
      dedupingInterval: 4000,
    },
  );
}
