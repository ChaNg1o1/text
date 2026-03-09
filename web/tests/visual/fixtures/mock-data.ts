import type {
  AnalysisDetail,
  AnalysisListResponse,
  AnalysisSummary,
  AppSettings,
  BackendInfo,
  CustomBackendInfo,
  FeaturesResponse,
  ForensicReport,
  ProgressSnapshotResponse,
  QaSuggestionsResponse,
  TextEntry,
} from "../../../src/lib/types";

const ISO_CREATED = "2026-03-07T09:00:00.000Z";
const ISO_COMPLETED = "2026-03-07T09:03:30.000Z";

const texts: TextEntry[] = [
  {
    id: "alpha-01",
    author: "alice",
    content: "Alpha thread sample about shipment timing and routing preferences.",
    source: "chat-export-a",
  },
  {
    id: "alpha-02",
    author: "alice",
    content: "Second Alpha sample reusing similar hedging and punctuation habits.",
    source: "chat-export-a",
  },
  {
    id: "beta-01",
    author: "bob",
    content: "Beta sample with shorter clauses and more direct instruction style.",
    source: "chat-export-b",
  },
  {
    id: "beta-02",
    author: "bob",
    content: "Second Beta sample with more direct wording and denser noun phrases.",
    source: "chat-export-b",
  },
];

const report: ForensicReport = {
  request: {
    texts,
    task: "full",
    task_params: {
      questioned_text_ids: ["alpha-01"],
      reference_author_ids: ["alice", "bob"],
      candidate_author_ids: ["alice", "bob"],
      cluster_text_ids: texts.map((text) => text.id),
      subject_ids: ["subject-alpha", "subject-beta"],
      account_ids: ["account-a", "account-b"],
      top_k: 3,
    },
    llm_backend: "openai/gpt-4.1",
    case_metadata: {
      case_id: "CASE-2026-VISUAL",
      client: "Visual QA",
      analyst: "Codex",
      notes: "Smoke fixture for deterministic report rendering.",
    },
    artifacts: [
      {
        artifact_id: "artifact-1",
        kind: "file_export",
        sha256: "artifact-sha-1",
        byte_count: 2048,
        source_name: "visual-smoke.jsonl",
        transform_chain: ["upload", "normalize"],
      },
    ],
    activity_events: [],
    interaction_edges: [],
  },
  summary: "视觉回归主结论：Alpha 组与 Beta 组都稳定成簇，但 Alpha 组内部更接近同一写作习惯。",
  conclusions: [
    {
      key: "conclusion-alpha",
      task: "full",
      statement: "Alpha 组文本表现出更稳定的写作节律和词汇选择。",
      grade: "moderate_support",
      score: 1.84,
      score_type: "log10_lr",
      subject: "Alpha group",
      evidence_ids: ["E-01", "E-02"],
      counter_evidence: ["Beta 组也共享部分主题词。"],
      limitations: ["样本总量仍偏少。"],
    },
    {
      key: "conclusion-beta",
      task: "profiling",
      statement: "Beta 组更偏向直接指令式表达，句子更短。",
      grade: "inconclusive",
      subject: "Beta group",
      evidence_ids: ["E-03"],
      counter_evidence: [],
      limitations: ["需要更多长文本验证句法分布。"],
    },
  ],
  materials: [
    {
      artifact_id: "artifact-1",
      source_name: "visual-smoke.jsonl",
      sha256: "artifact-sha-1",
      byte_count: 2048,
      text_ids: texts.map((text) => text.id),
    },
  ],
  methods: [
    {
      key: "stylometry-fingerprint",
      title: "Stylometry fingerprint",
      description: "Compares lexical diversity, sentence rhythm, punctuation, and marker overlap.",
      parameters: { top_k: 3, embedding_model: "text-embedding" },
    },
    {
      key: "cluster-pass",
      title: "Cluster pass",
      description: "Groups texts by embedding similarity and confirms cluster separation.",
      parameters: { min_cluster_size: 2, cutoff: 0.78 },
    },
  ],
  results: [
    {
      key: "result-1",
      title: "Alpha cluster stability",
      body: "Alpha samples remain visually cohesive across lexical and embedding views.",
      evidence_ids: ["E-01", "E-02"],
      interpretive_opinion: false,
      supporting_agents: ["stylometry", "computational"],
    },
    {
      key: "result-2",
      title: "Beta directive tone",
      body: "Beta samples show shorter clauses and more imperative constructions.",
      evidence_ids: ["E-03"],
      interpretive_opinion: true,
      supporting_agents: ["writing_process"],
    },
  ],
  limitations: [
    "当前样本总量足以展示结构，但还不足以给出高置信归因。",
    "时间跨度较短，暂时不能排除语境驱动。",
  ],
  reproducibility: {
    pipeline_version: "visual-smoke-v1",
    rust_feature_version: "rf-1.0.0",
    python_feature_version: "py-1.0.0",
    threshold_profile_version: "th-2026-03",
    prompt_template_version: "prompt-visual-smoke",
    model_id: "openai/gpt-4.1",
    generated_at: ISO_COMPLETED,
    parameter_snapshot: { locale: "zh", top_k: 3 },
  },
  appendix: [
    {
      key: "appendix-1",
      title: "Sample note",
      content: "Appendix content used to keep the supporting panel visible.",
    },
  ],
  writing_profiles: [
    {
      subject: "Alpha group",
      headline: "稳定的缓冲式表达",
      summary: "Alpha 组更常使用延迟判断与补充修饰，表达节奏偏缓。",
      observable_summary: "更高的句长稳定性与较明显的缓冲连接词使用。",
      stable_habits: ["偏爱“先看/再定”式表达", "更频繁使用补充说明逗号结构"],
      process_clues: ["会先压低结论强度，再补充限定条件"],
      anomalies: ["alpha-02 在 emoji 密度上明显偏高"],
      confidence_note: "画像结论建立在 2 个样本之上，适合辅助阅读，不适合作为唯一依据。",
      representative_text_ids: ["alpha-01", "alpha-02"],
      dimensions: [
        {
          key: "sentence_rhythm",
          label: "Sentence Rhythm",
          score: 78,
          confidence: 0.83,
          dimension_type: "observable",
          evidence_spans: ["E-01"],
          counter_evidence: [],
        },
        {
          key: "hedging",
          label: "Hedging",
          score: 72,
          confidence: 0.8,
          dimension_type: "observable",
          evidence_spans: ["E-02"],
          counter_evidence: [],
        },
        {
          key: "directive_mode",
          label: "Directive Mode",
          score: 31,
          confidence: 0.58,
          dimension_type: "observable",
          evidence_spans: ["E-03"],
          counter_evidence: ["beta-01 更强指令语气"],
        },
      ],
    },
  ],
  evidence_items: [
    {
      evidence_id: "E-01",
      label: "句长与节律稳定",
      summary: "Alpha 两段文本的句长分布更接近，内部波动更小。",
      source_text_ids: ["alpha-01", "alpha-02"],
      excerpts: ["先看一下时间窗口，再决定是否出货。"],
      metrics: { avg_sentence_length_delta: 0.12 },
      provenance_refs: ["stylometry-fingerprint"],
      interpretive_opinion: false,
      finding: "句长稳定性高于 Beta 组",
      why_it_matters: "说明作者在组织信息时更倾向固定节奏。",
      counter_readings: ["可能也受到任务模板影响。"],
      strength: "core",
      linked_conclusion_keys: ["conclusion-alpha"],
    },
    {
      evidence_id: "E-02",
      label: "缓冲连接词复现",
      summary: "Alpha 组更常用缓冲和限定结构来降低表述强度。",
      source_text_ids: ["alpha-01", "alpha-02"],
      excerpts: ["如果方便的话，我们可以先把范围缩小。"],
      metrics: { hedge_ratio: 0.34 },
      provenance_refs: ["stylometry-fingerprint", "cluster-pass"],
      interpretive_opinion: true,
      finding: "缓冲式表达在 Alpha 组更稳定",
      why_it_matters: "这类口气习惯通常在跨文本中比较稳定。",
      strength: "supporting",
      linked_conclusion_keys: ["conclusion-alpha"],
    },
    {
      evidence_id: "E-03",
      label: "指令句密度偏高",
      summary: "Beta 组文本更偏短句和直接动作指令。",
      source_text_ids: ["beta-01", "beta-02"],
      excerpts: ["直接改成周三发，不要再等。"],
      metrics: { imperative_density: 0.41 },
      provenance_refs: ["cluster-pass"],
      interpretive_opinion: false,
      finding: "Beta 组更偏直接命令式表达",
      why_it_matters: "帮助区分两组在语气和信息压缩方式上的差异。",
      counter_readings: ["也可能受场景紧急度影响。"],
      strength: "conflicting",
      linked_conclusion_keys: ["conclusion-beta"],
    },
  ],
  anomaly_samples: [
    {
      text_id: "alpha-02",
      content: "alpha-02 contains slightly more emoji and informal emphasis markers.",
      outlier_dimensions: {
        emoji_density: 2.1,
        sentence_length_variance: 1.8,
      },
    },
  ],
  agent_reports: [
    {
      agent_name: "stylometry",
      discipline: "stylometry",
      summary: "### Snapshot\nAlpha 组在句长节律与限定结构上更稳定。",
      findings: [
        {
          discipline: "stylometry",
          category: "sentence_rhythm",
          description: "Alpha 组句长波动小，内部节律更统一。",
          confidence: 0.82,
          evidence: ["E-01", "句长标准差低于 Beta 组"],
          interpretation: "更像稳定写作习惯，而不是一次性情境偏差。",
          opinion_kind: "deterministic_evidence",
        },
      ],
    },
    {
      agent_name: "writing_process",
      discipline: "writing_process",
      summary: "### Snapshot\nBeta 组更偏向任务型表达和直接动作句。",
      findings: [
        {
          discipline: "writing_process",
          category: "directive_tone",
          description: "Beta 组使用更短、更直接的命令式表达。",
          confidence: 0.64,
          evidence: ["E-03", "动作动词密度更高"],
          interpretation: "可作为语气画像参考，但不能单独归因。",
          opinion_kind: "interpretive_opinion",
          metadata: {
            inference_mode: "observable_process",
            caution: "该线索更适合辅助阅读，不适合作为唯一判断依据。",
          },
        },
      ],
    },
  ],
  narrative: {
    version: "v1",
    lead: "视觉回归主结论：Alpha 组更像一组内部一致的写作样本。",
    contradictions: ["Beta 组也共享部分主题词，不能仅靠词表直接归因。"],
    action_items: ["补充更长样本", "单独复核 alpha-02 的异常点"],
    sections: [
      {
        key: "bottom_line",
        title: "底线判断",
        summary: "Alpha 组内部一致性更强，但当前仍是中等支持。",
        detail: "就现有四段文本看，Alpha 组在句长、缓冲连接词和局部节律上更稳定。",
        evidence_ids: ["E-01", "E-02"],
        result_keys: ["result-1"],
        default_expanded: true,
      },
      {
        key: "evidence_chain",
        title: "证据链",
        summary: "主要证据集中在 Alpha 组的句长与限定结构上。",
        detail: "E-01 与 E-02 共同支撑 Alpha 组内部稳定性的判断。",
        evidence_ids: ["E-01", "E-02", "E-03"],
        result_keys: ["result-1", "result-2"],
        default_expanded: false,
      },
      {
        key: "limitations",
        title: "限制项",
        summary: "样本数和时间跨度都还偏窄。",
        detail: "目前的限制主要来自样本体量小、场景跨度窄，容易被语境信号放大。",
        evidence_ids: ["E-03"],
        result_keys: [],
        default_expanded: false,
      },
      {
        key: "next_actions",
        title: "下一步",
        summary: "继续补样本，并优先复核 Alpha 的异常文本。",
        detail: "先扩样，再针对 alpha-02 的异常维度做复核，可以提升后续判断稳定性。",
        evidence_ids: ["E-01"],
        result_keys: [],
        default_expanded: false,
      },
    ],
  },
  entity_aliases: {
    text_aliases: [
      { text_id: "alpha-01", alias: "Alpha Desk 01", author: "alice", preview: "shipment timing and routing" },
      { text_id: "alpha-02", alias: "Alpha Desk 02", author: "alice", preview: "hedging and punctuation habits" },
      { text_id: "beta-01", alias: "Beta Dispatch 01", author: "bob", preview: "direct instruction style" },
      { text_id: "beta-02", alias: "Beta Dispatch 02", author: "bob", preview: "denser noun phrases" },
    ],
    author_aliases: [
      { author_id: "alice", alias: "Alpha group" },
      { author_id: "bob", alias: "Beta group" },
    ],
  },
  cluster_view: {
    clusters: [
      {
        cluster_id: 1,
        label: "Alpha cluster",
        member_text_ids: ["alpha-01", "alpha-02"],
        member_aliases: ["Alpha Desk 01", "Alpha Desk 02"],
        representative_text_id: "alpha-01",
        representative_excerpt: "先看一下时间窗口，再决定是否出货。",
        theme_summary: "句长更稳，缓冲表达更多。",
        separation_summary: "与 Beta 组相比更少直接指令句。",
        top_markers: ["hedging", "comma cadence"],
        representative_evidence_ids: ["E-01", "E-02"],
        confidence_note: "基于 2 个样本。",
      },
      {
        cluster_id: 2,
        label: "Beta cluster",
        member_text_ids: ["beta-01", "beta-02"],
        member_aliases: ["Beta Dispatch 01", "Beta Dispatch 02"],
        representative_text_id: "beta-01",
        representative_excerpt: "直接改成周三发，不要再等。",
        theme_summary: "句子更短，动作更直接。",
        separation_summary: "更高的命令式与动作词密度。",
        top_markers: ["imperatives", "short clauses"],
        representative_evidence_ids: ["E-03"],
        confidence_note: "基于 2 个样本。",
      },
    ],
    excluded_text_ids: [],
  },
  created_at: ISO_COMPLETED,
};

export const completedAnalysisDetail: AnalysisDetail = {
  id: "visual-smoke",
  status: "completed",
  task_type: "full",
  llm_backend: "openai/gpt-4.1",
  text_count: texts.length,
  author_count: 2,
  created_at: ISO_CREATED,
  completed_at: ISO_COMPLETED,
  report,
  perf: {
    total_ms: 210_000,
    feature_extraction_ms: 49_000,
    agent_analysis_ms: 118_000,
    synthesis_ms: 43_000,
    texts_total: texts.length,
  },
};

const analyses: AnalysisSummary[] = [
  completedAnalysisDetail,
  {
    id: "running-smoke",
    status: "running",
    task_type: "verification",
    llm_backend: "claude/sonnet-4.5",
    text_count: 6,
    author_count: 3,
    created_at: "2026-03-08T03:20:00.000Z",
  },
  {
    id: "failed-smoke",
    status: "failed",
    task_type: "clustering",
    llm_backend: "openai/gpt-4.1-mini",
    text_count: 8,
    author_count: 4,
    created_at: "2026-03-06T11:00:00.000Z",
    completed_at: "2026-03-06T11:00:44.000Z",
    error_message: "Fixture failure for visual smoke coverage.",
  },
];

export function buildAnalysesResponse(searchParams: URLSearchParams): AnalysisListResponse {
  const requestedStatus = searchParams.get("status");
  const requestedTaskType = searchParams.get("task_type");
  const requestedSearch = searchParams.get("search")?.trim().toLowerCase();
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const requestedPageSize = Number(searchParams.get("page_size") ?? "20");

  let items = analyses;
  if (requestedStatus) {
    items = items.filter((item) => item.status === requestedStatus);
  }
  if (requestedTaskType) {
    items = items.filter((item) => item.task_type === requestedTaskType);
  }
  if (requestedSearch) {
    items = items.filter(
      (item) =>
        item.id.toLowerCase().includes(requestedSearch)
        || item.llm_backend.toLowerCase().includes(requestedSearch),
    );
  }

  return {
    items,
    total: items.length,
    page: requestedPage,
    page_size: requestedPageSize,
  };
}

export const backendsResponse = {
  backends: [
    {
      name: "openai/gpt-4.1",
      model: "gpt-4.1",
      provider: "openai",
      has_api_key: true,
    },
    {
      name: "claude/sonnet-4.5",
      model: "claude-sonnet-4.5",
      provider: "anthropic",
      has_api_key: true,
    },
    {
      name: "local/mock",
      model: "visual-mock",
      provider: "openai_compatible",
      has_api_key: false,
    },
  ] satisfies BackendInfo[],
};

export const customBackendsResponse = {
  backends: [
    {
      name: "studio",
      provider: "openai_compatible",
      model: "gpt-4.1",
      api_base: "https://api.studio.example/v1",
      api_key_env: "TEXT_STUDIO_API_KEY",
      has_api_key: true,
    },
    {
      name: "studio__gpt-5-mini",
      provider: "openai_compatible",
      model: "gpt-5-mini",
      api_base: "https://api.studio.example/v1",
      api_key_env: "TEXT_STUDIO_API_KEY",
      has_api_key: true,
    },
    {
      name: "field-lab",
      provider: "anthropic_compatible",
      model: "claude-sonnet-4.5",
      api_base: "https://api.field-lab.example/v1",
      api_key_env: "FIELD_LAB_API_KEY",
      has_api_key: false,
    },
  ] satisfies CustomBackendInfo[],
};

export const settingsResponse: AppSettings = {
  analysis_defaults: {
    default_llm_backend: "openai/gpt-4.1",
    default_task: "full",
    default_top_k: 3,
    default_case_analyst: "Codex",
    default_case_client: "Visual QA",
    qa_temperature: 0.2,
    qa_max_tokens: 1200,
  },
  prompt_overrides: {
    stylometry: "Prefer concise explanation of lexical overlaps.",
    writing_process: "",
    computational: "Highlight cluster separation before anomaly detail.",
    sociolinguistics: "",
    synthesis: "",
    qa: "",
  },
};

export const featuresResponse: FeaturesResponse = {
  analysis_id: "visual-smoke",
  features: [
    {
      text_id: "alpha-01",
      content_hash: "hash-alpha-01",
      rust_features: {
        token_count: 84,
        type_token_ratio: 0.63,
        hapax_legomena_ratio: 0.19,
        yules_k: 42,
        avg_word_length: 4.9,
        avg_sentence_length: 16.5,
        sentence_length_variance: 2.4,
        char_ngrams: { the: 0.12, ing: 0.08 },
        word_ngrams: { "先 看": 0.14, "再 决定": 0.11 },
        punctuation_profile: { comma: 0.21, period: 0.08 },
        function_word_freq: { and: 0.05, if: 0.04 },
        cjk_ratio: 0.21,
        emoji_density: 0.01,
        formality_score: 0.68,
        code_switching_ratio: 0.04,
        brunets_w: 9.4,
        honores_r: 447,
        simpsons_d: 0.88,
        mtld: 72,
        hd_d: 0.82,
        coleman_liau_index: 8.4,
      },
      nlp_features: {
        pos_tag_distribution: { noun: 0.31, verb: 0.22 },
        clause_depth_avg: 2.1,
        liwc_dimensions: { analytic: 74, clout: 51 },
        sentiment_valence: 0.24,
        emotional_tone: 0.48,
        cognitive_complexity: 0.57,
        temporal_orientation: { present: 0.42, future: 0.18 },
        embedding: [0.82, 0.74, 0.68, 0.22, 0.18, 0.15],
        topic_distribution: [0.61, 0.22, 0.17],
      },
    },
    {
      text_id: "alpha-02",
      content_hash: "hash-alpha-02",
      rust_features: {
        token_count: 80,
        type_token_ratio: 0.6,
        hapax_legomena_ratio: 0.17,
        yules_k: 44,
        avg_word_length: 5.0,
        avg_sentence_length: 17.1,
        sentence_length_variance: 2.8,
        char_ngrams: { the: 0.11, ion: 0.06 },
        word_ngrams: { "如果 方便": 0.12, "先 缩小": 0.1 },
        punctuation_profile: { comma: 0.24, period: 0.07 },
        function_word_freq: { and: 0.04, if: 0.05 },
        cjk_ratio: 0.24,
        emoji_density: 0.04,
        formality_score: 0.64,
        code_switching_ratio: 0.05,
        brunets_w: 9.8,
        honores_r: 431,
        simpsons_d: 0.86,
        mtld: 69,
        hd_d: 0.79,
        coleman_liau_index: 8.8,
      },
      nlp_features: {
        pos_tag_distribution: { noun: 0.29, verb: 0.24 },
        clause_depth_avg: 2.2,
        liwc_dimensions: { analytic: 71, clout: 49 },
        sentiment_valence: 0.2,
        emotional_tone: 0.5,
        cognitive_complexity: 0.59,
        temporal_orientation: { present: 0.46, future: 0.16 },
        embedding: [0.79, 0.71, 0.7, 0.25, 0.2, 0.16],
        topic_distribution: [0.58, 0.24, 0.18],
      },
    },
    {
      text_id: "beta-01",
      content_hash: "hash-beta-01",
      rust_features: {
        token_count: 61,
        type_token_ratio: 0.51,
        hapax_legomena_ratio: 0.12,
        yules_k: 61,
        avg_word_length: 4.4,
        avg_sentence_length: 11.2,
        sentence_length_variance: 4.9,
        char_ngrams: { dir: 0.13, act: 0.09 },
        word_ngrams: { "直接 改成": 0.16, "不要 再等": 0.14 },
        punctuation_profile: { comma: 0.1, period: 0.14 },
        function_word_freq: { and: 0.02, if: 0.01 },
        cjk_ratio: 0.19,
        emoji_density: 0,
        formality_score: 0.52,
        code_switching_ratio: 0.01,
        brunets_w: 10.6,
        honores_r: 387,
        simpsons_d: 0.73,
        mtld: 54,
        hd_d: 0.67,
        coleman_liau_index: 7.1,
      },
      nlp_features: {
        pos_tag_distribution: { noun: 0.24, verb: 0.31 },
        clause_depth_avg: 1.4,
        liwc_dimensions: { analytic: 62, clout: 58 },
        sentiment_valence: 0.08,
        emotional_tone: 0.39,
        cognitive_complexity: 0.41,
        temporal_orientation: { present: 0.61, future: 0.06 },
        embedding: [0.18, 0.22, 0.35, 0.81, 0.76, 0.72],
        topic_distribution: [0.23, 0.55, 0.22],
      },
    },
    {
      text_id: "beta-02",
      content_hash: "hash-beta-02",
      rust_features: {
        token_count: 64,
        type_token_ratio: 0.49,
        hapax_legomena_ratio: 0.11,
        yules_k: 64,
        avg_word_length: 4.5,
        avg_sentence_length: 10.7,
        sentence_length_variance: 4.3,
        char_ngrams: { ord: 0.1, act: 0.1 },
        word_ngrams: { "直接 发": 0.15, "马上 处理": 0.11 },
        punctuation_profile: { comma: 0.08, period: 0.16 },
        function_word_freq: { and: 0.02, if: 0.01 },
        cjk_ratio: 0.18,
        emoji_density: 0,
        formality_score: 0.55,
        code_switching_ratio: 0.02,
        brunets_w: 10.2,
        honores_r: 392,
        simpsons_d: 0.75,
        mtld: 56,
        hd_d: 0.69,
        coleman_liau_index: 7.4,
      },
      nlp_features: {
        pos_tag_distribution: { noun: 0.26, verb: 0.29 },
        clause_depth_avg: 1.5,
        liwc_dimensions: { analytic: 64, clout: 56 },
        sentiment_valence: 0.11,
        emotional_tone: 0.41,
        cognitive_complexity: 0.43,
        temporal_orientation: { present: 0.58, future: 0.08 },
        embedding: [0.21, 0.24, 0.31, 0.77, 0.73, 0.7],
        topic_distribution: [0.25, 0.51, 0.24],
      },
    },
  ],
};

export const progressSnapshotResponse: ProgressSnapshotResponse = {
  analysis_id: "visual-smoke",
  events: [],
};

export const qaSuggestionsResponse: QaSuggestionsResponse = {
  suggestions: [
    "最值得先看的证据锚点是什么？",
    "这份报告里最需要谨慎解读的地方是什么？",
    "Alpha 组和 Beta 组最大的结构差异是什么？",
    "如果只保留三条线索，应该保留哪三条？",
  ],
};
