"use client";

import { create } from "zustand";

export type FocusEntityType =
  | "conclusion"
  | "evidence"
  | "text"
  | "cluster"
  | "profile";

export interface FocusContext {
  entityType: FocusEntityType;
  entityId: string;
  source: string;
}

interface ReportVisualizationStore {
  focus: FocusContext | null;
  setFocus: (focus: FocusContext) => void;
  clearFocus: () => void;
  reset: () => void;
}

export const useReportVisualizationStore = create<ReportVisualizationStore>((set) => ({
  focus: null,
  setFocus: (focus) => set({ focus }),
  clearFocus: () => set({ focus: null }),
  reset: () =>
    set({
      focus: null,
    }),
}));
