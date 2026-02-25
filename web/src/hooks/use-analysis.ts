import useSWR from "swr";
import { api } from "@/lib/api-client";
import type { AnalysisDetail } from "@/lib/types";

export function useAnalysis(id: string | undefined) {
  return useSWR<AnalysisDetail>(id ? `/analyses/${id}` : null, () => api.getAnalysis(id!));
}
