// Enums
export type TaskType = "attribution" | "profiling" | "sockpuppet" | "full";
export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

// Data models
export interface TextEntry {
  id: string;
  author: string;
  content: string;
  timestamp?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RustFeatures {
  token_count: number;
  type_token_ratio: number;
  hapax_legomena_ratio: number;
  yules_k: number;
  avg_word_length: number;
  avg_sentence_length: number;
  sentence_length_variance: number;
  char_ngrams: Record<string, number>;
  word_ngrams: Record<string, number>;
  punctuation_profile: Record<string, number>;
  function_word_freq: Record<string, number>;
  cjk_ratio: number;
  emoji_density: number;
  formality_score: number;
  code_switching_ratio: number;
  brunets_w: number;
  honores_r: number;
  simpsons_d: number;
  mtld: number;
  hd_d: number;
  coleman_liau_index: number;
}

export interface NlpFeatures {
  pos_tag_distribution: Record<string, number>;
  clause_depth_avg: number;
  liwc_dimensions: Record<string, number>;
  sentiment_valence: number;
  emotional_tone: number;
  cognitive_complexity: number;
  temporal_orientation: Record<string, number>;
  embedding: number[];
  topic_distribution: number[];
}

export interface FeatureVector {
  text_id: string;
  content_hash: string;
  rust_features: RustFeatures;
  nlp_features: NlpFeatures;
}

export interface AnomalySample {
  text_id: string;
  content: string;
  outlier_dimensions: Record<string, number>;
}

export interface AgentFinding {
  discipline: string;
  category: string;
  description: string;
  confidence: number;
  evidence: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentReport {
  agent_name: string;
  discipline: string;
  findings: AgentFinding[];
  summary: string;
  raw_llm_response?: string;
}

export interface ForensicReport {
  request: AnalysisRequest;
  agent_reports: AgentReport[];
  synthesis: string;
  confidence_scores: Record<string, number>;
  contradictions: string[];
  recommendations: string[];
  anomaly_samples: AnomalySample[];
  created_at: string;
}

// API models
export interface AnalysisRequest {
  texts: TextEntry[];
  task: TaskType;
  compare_groups?: string[][];
  llm_backend: string;
}

export interface UploadResponse {
  texts: TextEntry[];
  text_count: number;
  author_count: number;
  authors: string[];
}

export interface CreateAnalysisRequest {
  texts: TextEntry[];
  task: TaskType;
  compare_groups?: string[][];
  llm_backend: string;
}

export interface AnalysisSummary {
  id: string;
  status: AnalysisStatus;
  task_type: string;
  llm_backend: string;
  text_count: number;
  author_count: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface AnalysisPerf {
  feature_extraction_ms?: number;
  agent_analysis_ms?: number;
  synthesis_ms?: number;
  total_ms?: number;
  rust_ms?: number;
  spacy_ms?: number;
  embedding_ms?: number;
  cache_get_ms?: number;
  cache_put_ms?: number;
  cache_hits?: number;
  cache_misses?: number;
  texts_total?: number;
}

export interface AnalysisDetail extends AnalysisSummary {
  report?: ForensicReport;
  perf?: AnalysisPerf;
}

export interface AnalysisListResponse {
  items: AnalysisSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface FeaturesResponse {
  analysis_id: string;
  features: FeatureVector[];
}

export interface BackendInfo {
  name: string;
  model: string;
  provider: string;
  has_api_key: boolean;
}

export interface BackendsResponse {
  backends: BackendInfo[];
}

export interface CustomBackendInfo {
  name: string;
  provider: "openai_compatible" | "anthropic_compatible" | string;
  model: string;
  api_base: string;
  api_key_env?: string;
  has_api_key: boolean;
}

export interface CustomBackendsResponse {
  backends: CustomBackendInfo[];
}

export interface UpsertCustomBackendRequest {
  provider: "openai_compatible" | "anthropic_compatible";
  model: string;
  api_base: string;
  api_key?: string;
  api_key_env?: string;
  clear_api_key?: boolean;
}

export interface BackendTestResponse {
  backend: string;
  success: boolean;
  detail: string;
  latency_ms?: number;
}

// SSE Events
export type SSEEventType =
  | "analysis_started"
  | "phase_changed"
  | "feature_extraction_progress"
  | "agent_started"
  | "agent_completed"
  | "synthesis_started"
  | "synthesis_completed"
  | "analysis_completed"
  | "analysis_failed"
  | "log"
  | "heartbeat";

export interface SSEEventData {
  timestamp: number;
  [key: string]: unknown;
}
