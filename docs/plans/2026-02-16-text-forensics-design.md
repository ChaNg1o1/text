# Text Forensics Platform - Design Document

## Overview

A multi-agent digital forensics text analysis platform that combines four linguistic disciplines to analyze authorship, psychological profiles, and behavioral patterns from text data.

## Architecture: Hybrid Shared Feature Layer + Agent Team (Approach C)

```
Input → [Preprocessor + Feature Extraction (Rust/PyO3)] → Feature Cache
                                │
                     ┌──────────┴──────────┐
                     │   Orchestrator      │
                     │   (ADK Agent)       │
                     └──────────┬──────────┘
               ┌───────┬───────┼───────┬───────┐
               ▼       ▼       ▼       ▼       ▼
          Stylometry Psycho  Comp   Socio   Synthesis
          Agent      Agent   Agent  Agent   Agent
```

## Core Use Cases

1. **Authorship Attribution** - identify anonymous authors by comparing writing style fingerprints
2. **Psychological Profiling** - infer personality traits, emotional states, motivations from text
3. **Sockpuppet Detection** - detect coordinated accounts or single person behind multiple identities
4. **Comprehensive Forensic Analysis** - cross-validate findings across all four disciplines

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| CLI | typer + rich | Modern Python CLI with beautiful output |
| Agent | google-adk | A2A protocol native, agent team orchestration |
| LLM | litellm | Unified API for Claude/GPT/Ollama/vLLM |
| NLP (EN) | spaCy (en_core_web_trf) | Industrial tokenizer + POS + NER + dep parse |
| NLP (ZH) | spaCy (zh_core_web_trf) | Chinese segmentation + POS + dep parse |
| Embeddings | sentence-transformers | Multilingual semantic vectors |
| Rust-Python | PyO3 + maturin | Standard Rust-Python extension bridge |
| Storage | SQLite (feature cache) | Lightweight, zero-dependency, CLI-friendly |

## Agent Responsibilities

### Stylometry Agent
- Vocabulary richness metrics (TTR, hapax, Yule's K)
- Sentence structure patterns
- Punctuation/symbol preferences
- N-gram fingerprinting
- Function word frequency distribution

### Psycholinguistics Agent
- LIWC dimension analysis (72 dimensions)
- Sentiment and emotional tone
- Cognitive complexity indicators
- Temporal orientation (past/present/future)
- Big Five personality trait inference
- Motivation and drive patterns

### Computational Linguistics Agent
- Topic modeling and distribution
- Semantic similarity and clustering
- Text classification
- Anomaly detection in writing patterns
- Embedding-based author similarity

### Sociolinguistics Agent
- Social identity markers (age/gender/region/education)
- Code-switching patterns (CJK/Latin mix)
- Register and formality analysis
- Group language feature detection
- Slang and emoji usage patterns

### Synthesis Agent
- Cross-validate findings from all four agents
- Resolve contradictions between agent conclusions
- Generate confidence scores
- Produce comprehensive forensic report

## Feature Extraction: Rust vs Python Split

**Rust (performance-critical):** n-gram extraction, lexical richness metrics, Unicode analysis, punctuation profiling, batch text statistics

**Python (ecosystem-dependent):** spaCy dependency parsing, LIWC dictionary matching, sentence-transformers embeddings, topic modeling

## Data Flow

1. User imports text data (CSV/JSON/TXT) via CLI
2. Preprocessor normalizes and segments text
3. Rust feature extractor computes structural/statistical features (parallel via rayon)
4. Python feature extractor computes NLP/ML features (spaCy pipe, embeddings)
5. All features cached in SQLite (keyed by BLAKE2b content hash)
6. Orchestrator Agent dispatches analysis to 4 discipline agents (parallel)
7. Each agent reads cached features + calls LLM for interpretation
8. Synthesis Agent integrates all findings, resolves contradictions
9. Report rendered as Markdown/JSON

## Input Format

```json
{
  "texts": [
    {"id": "t1", "author": "user_a", "content": "...", "timestamp": "2024-01-01T00:00:00Z", "source": "weibo"},
    {"id": "t2", "author": "user_b", "content": "...", "timestamp": "2024-01-02T00:00:00Z", "source": "twitter"}
  ],
  "task": "attribution|profiling|sockpuppet|full",
  "compare_groups": [["user_a"], ["user_b", "user_c"]]
}
```

## CLI Interface

```bash
# Full forensic analysis
text analyze --input data.json --task full --llm claude

# Author attribution between groups
text analyze --input data.json --task attribution --compare user_a user_b

# Psychological profiling
text analyze --input data.json --task profiling --author user_a

# Sockpuppet detection
text analyze --input data.json --task sockpuppet --suspects user_b,user_c

# Export features only (no LLM)
text features --input data.json --output features.parquet
```
