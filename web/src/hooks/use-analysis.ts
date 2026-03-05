import useSWR from "swr";
import { ApiError, api } from "@/lib/api-client";
import type { AnalysisDetail } from "@/lib/types";

export function useAnalysis(id: string | undefined) {
  return useSWR<AnalysisDetail>(
    id ? `/analyses/${id}` : null,
    () => api.getAnalysis(id!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: (error: unknown) => {
        if (error instanceof ApiError) {
          if (error.status === 404 || error.status === 400 || error.status === 422) {
            return false;
          }
          return error.status === 408 || error.status >= 500;
        }
        return true;
      },
      errorRetryCount: 3,
      errorRetryInterval: 2500,
      dedupingInterval: 4000,
    },
  );
}
