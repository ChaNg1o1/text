import useSWR from "swr";
import { ApiError, api } from "@/lib/api-client";
import type { FeaturesResponse } from "@/lib/types";

export function useAnalysisFeatures(id: string | undefined, enabled = true) {
  return useSWR<FeaturesResponse>(
    enabled && id ? `/analyses/${id}/features` : null,
    () => api.getFeatures(id!),
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
      errorRetryCount: 2,
      errorRetryInterval: 3000,
      dedupingInterval: 10000,
      keepPreviousData: true,
    },
  );
}
