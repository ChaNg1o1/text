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

export interface LensState {
  feature: boolean;
  cluster: boolean;
  anomaly: boolean;
}

interface ReportVisualizationStore {
  focus: FocusContext | null;
  lenses: LensState;
  setFocus: (focus: FocusContext) => void;
  clearFocus: () => void;
  toggleLens: (lens: keyof LensState) => void;
  reset: () => void;
}

const DEFAULT_LENSES: LensState = {
  feature: false,
  cluster: false,
  anomaly: false,
};

export const useReportVisualizationStore = create<ReportVisualizationStore>((set) => ({
  focus: null,
  lenses: DEFAULT_LENSES,
  setFocus: (focus) => set({ focus }),
  clearFocus: () => set({ focus: null }),
  toggleLens: (lens) =>
    set((state) => ({
      lenses: {
        ...state.lenses,
        [lens]: !state.lenses[lens],
      },
    })),
  reset: () =>
    set({
      focus: null,
      lenses: DEFAULT_LENSES,
    }),
}));
