export type TaskType =
  | "verification"
  | "closed_set_id"
  | "open_set_id"
  | "clustering"
  | "profiling"
  | "sockpuppet"
  | "self_discovery"
  | "clue_extraction"
  | "full";
export type AnalysisStatus = "pending" | "running" | "completed" | "failed" | "canceled";
export type ConclusionGrade =
  | "strong_support"
  | "moderate_support"
  | "inconclusive"
  | "moderate_against"
  | "strong_against";
export type DerivationKind = "original" | "normalized" | "ocr" | "transcribed" | "manual_entry";
export type ArtifactKind = "raw_text" | "file_export" | "screenshot_ocr" | "transcript" | "manual_entry";

export interface CaseMetadata {
  case_id?: string;
  client?: string;
  analyst?: string;
  notes?: string;
}

export interface TaskParams {
  questioned_text_ids: string[];
  reference_author_ids: string[];
  candidate_author_ids: string[];
  cluster_text_ids: string[];
  subject_ids: string[];
  account_ids: string[];
  top_k: number;
}

export interface ArtifactRecord {
  artifact_id: string;
  kind: ArtifactKind;
  sha256: string;
  byte_count: number;
  source_name: string;
  acquisition_timestamp?: string;
  operator?: string;
  transform_chain: string[];
  notes?: string;
}

export interface ActivityEvent {
  event_id: string;
  account_id: string;
  event_type: string;
  occurred_at: string;
  thread_id?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
}

export interface InteractionEdge {
  source_account_id: string;
  target_account_id: string;
  relation_type: string;
  weight: number;
  first_seen_at?: string;
  last_seen_at?: string;
  metadata?: Record<string, unknown>;
}

export interface TextEntry {
  id: string;
  author: string;
  content: string;
  timestamp?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  artifact_id?: string;
  content_sha256?: string;
  derivation_kind?: DerivationKind;
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
  opinion_kind?: "deterministic_evidence" | "interpretive_opinion";
  interpretation?: string;
}

export interface LLMCallRecord {
  agent: string;
  model_id: string;
  timestamp: string;
  prompt_hash: string;
  response_hash: string;
  token_count_in?: number;
  token_count_out?: number;
  temperature?: number;
  cache_hit?: boolean;
}

export interface AgentReport {
  agent_name: string;
  discipline: string;
  findings: AgentFinding[];
  summary: string;
  raw_llm_response?: string;
  llm_call?: LLMCallRecord;
}

export interface EvidenceItem {
  evidence_id: string;
  label: string;
  summary: string;
  source_text_ids: string[];
  excerpts: string[];
  metrics: Record<string, number>;
  provenance_refs: string[];
  interpretive_opinion: boolean;
  finding?: string;
  why_it_matters?: string;
  counter_readings?: string[];
  strength?: "core" | "supporting" | "conflicting";
  linked_conclusion_keys?: string[];
}

export interface ReportConclusion {
  key: string;
  task: TaskType;
  statement: string;
  grade: ConclusionGrade;
  score?: number;
  score_type?: string;
  subject?: string;
  evidence_ids: string[];
  counter_evidence: string[];
  limitations: string[];
  metadata?: Record<string, unknown>;
}

export interface ReportMaterial {
  artifact_id: string;
  source_name: string;
  sha256: string;
  byte_count: number;
  text_ids: string[];
  note?: string;
}

export interface MethodRecord {
  key: string;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  threshold_profile_version?: string;
}

export interface ResultRecord {
  key: string;
  title: string;
  body: string;
  evidence_ids: string[];
  interpretive_opinion: boolean;
  supporting_agents: string[];
}

export type NarrativeSectionKey =
  | "bottom_line"
  | "evidence_chain"
  | "conflicts"
  | "limitations"
  | "next_actions";

export interface NarrativeSection {
  key: NarrativeSectionKey;
  title: string;
  summary: string;
  detail: string;
  evidence_ids: string[];
  result_keys: string[];
  default_expanded: boolean;
}

export interface NarrativeBundle {
  version: "v1";
  lead: string;
  sections: NarrativeSection[];
  action_items: string[];
  contradictions: string[];
}

export interface TextAliasRecord {
  text_id: string;
  alias: string;
  author: string;
  preview: string;
}

export interface AuthorAliasRecord {
  author_id: string;
  alias: string;
}

export interface EntityAliases {
  text_aliases: TextAliasRecord[];
  author_aliases: AuthorAliasRecord[];
}

export interface ClusterViewCluster {
  cluster_id: number;
  label: string;
  member_text_ids: string[];
  member_aliases: string[];
  representative_text_id?: string;
  representative_excerpt: string;
  theme_summary?: string;
  separation_summary?: string;
  top_markers?: string[];
  representative_evidence_ids?: string[];
  confidence_note?: string;
}

export interface ClusterView {
  clusters: ClusterViewCluster[];
  excluded_text_ids: string[];
}

export interface WritingProfileDimension {
  key: string;
  label: string;
  score: number;
  confidence: number;
  dimension_type: "observable" | "speculative";
  evidence_spans: string[];
  counter_evidence: string[];
}

export interface WritingProfile {
  subject: string;
  summary: string;
  dimensions: WritingProfileDimension[];
  headline?: string;
  observable_summary?: string;
  stable_habits?: string[];
  process_clues?: string[];
  anomalies?: string[];
  confidence_note?: string;
  representative_text_ids?: string[];
}

export interface ReproducibilityInfo {
  report_sha256?: string;
  request_fingerprint?: string;
  pipeline_version: string;
  rust_feature_version: string;
  python_feature_version: string;
  threshold_profile_version: string;
  prompt_template_version: string;
  model_id?: string;
  generated_at: string;
  parameter_snapshot: Record<string, unknown>;
}

export interface ProvenanceRecord {
  report_id: string;
  input_manifest: ArtifactRecord[];
  pipeline_version: string;
  feature_extractor_version: Record<string, string>;
  threshold_profile_version: string;
  llm_calls: LLMCallRecord[];
  report_sha256?: string;
  created_at: string;
  operator?: string;
}

export interface AppendixItem {
  key: string;
  title: string;
  content: string;
}

export interface ForensicReport {
  request: AnalysisRequest;
  summary: string;
  conclusions: ReportConclusion[];
  materials: ReportMaterial[];
  methods: MethodRecord[];
  results: ResultRecord[];
  limitations: string[];
  reproducibility: ReproducibilityInfo;
  appendix: AppendixItem[];
  provenance?: ProvenanceRecord;
  writing_profiles: WritingProfile[];
  evidence_items: EvidenceItem[];
  anomaly_samples: AnomalySample[];
  agent_reports: AgentReport[];
  narrative?: NarrativeBundle;
  entity_aliases?: EntityAliases;
  cluster_view?: ClusterView;
  created_at: string;
}

export interface AnalysisRequest {
  texts: TextEntry[];
  task: TaskType;
  task_params: TaskParams;
  llm_backend: string;
  case_metadata?: CaseMetadata;
  artifacts: ArtifactRecord[];
  activity_events: ActivityEvent[];
  interaction_edges: InteractionEdge[];
}

export interface UploadResponse {
  texts: TextEntry[];
  artifacts: ArtifactRecord[];
  activity_events: ActivityEvent[];
  interaction_edges: InteractionEdge[];
  text_count: number;
  author_count: number;
  authors: string[];
}

export interface CreateAnalysisRequest {
  texts: TextEntry[];
  task: TaskType;
  task_params: TaskParams;
  llm_backend: string;
  case_metadata?: CaseMetadata;
  artifacts: ArtifactRecord[];
  activity_events: ActivityEvent[];
  interaction_edges: InteractionEdge[];
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
  api_key?: string | null;
  api_key_env?: string | null;
  inherit_api_key_from?: string | null;
  clear_api_key?: boolean;
}

export interface BackendTestResponse {
  backend: string;
  success: boolean;
  detail: string;
  latency_ms?: number;
}

export interface PromptOverrides {
  stylometry: string;
  writing_process: string;
  computational: string;
  sociolinguistics: string;
  synthesis: string;
  qa: string;
}

export interface AnalysisDefaults {
  default_llm_backend?: string;
  default_task: TaskType;
  default_top_k: number;
  default_case_analyst: string;
  default_case_client: string;
  qa_temperature: number;
  qa_max_tokens: number;
}

export interface AppSettings {
  analysis_defaults: AnalysisDefaults;
  prompt_overrides: PromptOverrides;
}

export interface RetryAnalysisRequest {
  llm_backend: string;
  case_metadata?: CaseMetadata;
}

export interface QaSuggestionsRequest {
  count?: number;
  exclude?: string[];
}

export interface QaSuggestionsResponse {
  suggestions: string[];
}

export type SSEEventType =
  | "analysis_started"
  | "phase_changed"
  | "feature_extraction_progress"
  | "agent_started"
  | "agent_completed"
  | "synthesis_started"
  | "synthesis_completed"
  | "analysis_completed"
  | "analysis_cancelled"
  | "analysis_failed"
  | "log"
  | "heartbeat";

export interface SSEEventData {
  timestamp: number;
  [key: string]: unknown;
}

export interface ProgressEventRecord {
  event: SSEEventType;
  data: SSEEventData;
}

export interface ProgressSnapshotResponse {
  analysis_id: string;
  events: ProgressEventRecord[];
}
