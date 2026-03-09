import { create } from "zustand";
import type { SSEEventData, SSEEventType } from "@/lib/types";

export type AnalysisPhase =
  | "pending"
  | "feature_extraction"
  | "agent_analysis"
  | "synthesis"
  | "completed"
  | "canceled"
  | "failed";

export interface AgentProgress {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "empty";
  findingsCount?: number;
  durationSeconds?: number;
}

export interface ProgressState {
  phase: AnalysisPhase;
  featureProgress: { completed: number; total: number; currentTextId: string };
  agents: Record<string, AgentProgress>;
  logs: Array<{ level: string; message: string; source: string; timestamp: number }>;
  startedAt?: number;
  lastEventAt?: number;
  eventCount: number;
  meta?: {
    analysisId?: string;
    textCount?: number;
    authorCount?: number;
    taskType?: string;
    llmBackend?: string;
  };
  error?: string;
  durationSeconds?: number;
}

const INITIAL_AGENTS: Record<string, AgentProgress> = {
  stylometry: { name: "stylometry", status: "pending" },
  writing_process: { name: "writing_process", status: "pending" },
  computational: { name: "computational", status: "pending" },
  sociolinguistics: { name: "sociolinguistics", status: "pending" },
};

interface AnalysisStore {
  progress: Record<string, ProgressState>;
  getProgress: (id: string) => ProgressState;
  handleSSEEvent: (id: string, event: SSEEventType, data: SSEEventData) => void;
  reset: (id: string) => void;
}

type InternalProgressState = ProgressState & {
  _recentEventKeys?: string[];
};

const DEFAULT_PROGRESS: ProgressState = {
  phase: "pending",
  featureProgress: { completed: 0, total: 0, currentTextId: "" },
  agents: { ...INITIAL_AGENTS },
  logs: [],
  eventCount: 0,
};

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  progress: {},

  getProgress: (id: string) =>
    get().progress[id] ?? DEFAULT_PROGRESS,

  handleSSEEvent: (id: string, event: SSEEventType, data: SSEEventData) => {
    set((state) => {
      const prev: InternalProgressState = state.progress[id] ?? {
        ...DEFAULT_PROGRESS,
        agents: { ...INITIAL_AGENTS },
        logs: [],
      };
      const eventKey = `${event}:${JSON.stringify(data)}`;
      if (prev._recentEventKeys?.includes(eventKey)) {
        return state;
      }

      const next: InternalProgressState = { ...prev };
      next._recentEventKeys = [...(prev._recentEventKeys ?? []).slice(-511), eventKey];
      const eventTimestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now() / 1000;
      next.lastEventAt = eventTimestamp;
      next.eventCount = (prev.eventCount ?? 0) + 1;

      switch (event) {
        case "analysis_started":
          next.phase = "pending";
          next.startedAt = eventTimestamp;
          next.meta = {
            analysisId: (data.analysis_id as string) ?? id,
            textCount: data.text_count as number | undefined,
            authorCount: data.author_count as number | undefined,
            taskType: data.task_type as string | undefined,
            llmBackend: data.llm_backend as string | undefined,
          };
          break;
        case "phase_changed":
          next.phase = (data.phase as AnalysisPhase) ?? next.phase;
          break;
        case "feature_extraction_progress":
          next.featureProgress = {
            completed: (data.completed as number) ?? 0,
            total: (data.total as number) ?? 0,
            currentTextId: (data.current_text_id as string) ?? "",
          };
          break;
        case "agent_started":
          next.agents = { ...next.agents };
          next.agents[data.agent as string] = {
            ...next.agents[data.agent as string],
            status: "running",
          };
          break;
        case "agent_completed":
          next.agents = { ...next.agents };
          next.agents[data.agent as string] = {
            name: data.agent as string,
            status: (data.status as AgentProgress["status"]) ?? "completed",
            findingsCount: data.findings_count as number,
            durationSeconds: data.duration_seconds as number,
          };
          break;
        case "synthesis_started":
          next.phase = "synthesis";
          break;
        case "synthesis_completed":
          break;
        case "analysis_completed":
          next.phase = "completed";
          next.durationSeconds = data.duration_seconds as number;
          break;
        case "analysis_cancelled":
          next.phase = "canceled";
          next.error = (data.reason as string) ?? "Canceled by user";
          break;
        case "analysis_failed":
          next.phase = "failed";
          next.error = data.error as string;
          break;
        case "log":
          next.logs = [
            ...next.logs.slice(-199),
            {
              level: (data.level as string) ?? "info",
              message: (data.message as string) ?? "",
              source: (data.source as string) ?? "",
              timestamp: eventTimestamp,
            },
          ];
          break;
      }

      return { progress: { ...state.progress, [id]: next } };
    });
  },

  reset: (id: string) => {
    set((state) => {
      const rest = { ...state.progress };
      delete rest[id];
      return { progress: rest };
    });
  },
}));
