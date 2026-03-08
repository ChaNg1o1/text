# Product Repositioning Design: Text Detective

Date: 2026-03-08

## 1. Product Vision

### One-liner

text —— Text Detective. Give it any text, it pulls out hidden clues like a detective.

### Narrative Shift

| Dimension | Before | After |
|-----------|--------|-------|
| Core metaphor | Forensic lab | Detective |
| User perception | "Professional analysis platform" | "Give me text, I tell you what's hidden inside" |
| Entry barrier | Configure task type, select backend, upload files | Paste text, see clues immediately |
| Depth model | Full report from the start | Progressive disclosure: clues → deep dive → investigation |
| Audience | Internal forensic analysts | Anyone curious about the story behind text |

### Core Principle: Progressive Disclosure

The product does NOT separate "consumer mode" and "professional mode". Everyone enters from the same door. The difference is **how deep you choose to go**:

- General users: read clue cards, share "Writing DNA" portrait
- OSINT investigators: start from clues, add more texts, compare, cluster, build cases

## 2. Output Content Repositioning

### Agent Output Framework

Every agent's output expands from pure forensic findings to three layers:

```
findings:
  clues:       # Trackable signals, anomalies, patterns (universal)
  portrait:    # Writer characteristics, habit interpretation (self-discovery oriented)
  evidence:    # Supporting data and text excerpts (professional/OSINT oriented)
```

**All three layers are ALWAYS present in ALL task types.** No layer is hidden or omitted based on task type.

The only difference across task types is the **narrative perspective**:

| Task Type | Perspective | Example |
|-----------|------------|---------|
| `self_discovery` | 2nd person | "Your writing shows..." |
| `clue_extraction` | 3rd person | "The text author exhibits..." |
| All existing types | 3rd person + forensic context | "The questioned text exhibits..." |

### Agent-by-Agent Repositioning

| Agent | Current Output | New Output |
|-------|---------------|------------|
| Stylometry | Authorship attribution evidence | **Writing Fingerprint** — signature expressions, consistency patterns, stylistic habits |
| Psycholinguistics | Forensic psycholinguistic findings | **Psychological Portrait** — thinking style, emotional tendencies, cognitive patterns, self-awareness level |
| Sociolinguistics | Forensic sociolinguistic findings | **Social Identity Clues** — education background, professional domain, cultural community, linguistic community traits |
| Computational | Statistical similarity & clustering | **Patterns & Associations** — hidden data patterns, anomalies, cross-text association signals |
| Synthesis | Comprehensive forensic conclusion | **Detective Summary** — cross-validation of all clues, contradictions, confidence levels, core findings |

### Agent Prompt Changes

Role framing shifts from forensic expert to text detective:

- Before: "You are a forensic stylometry expert providing evidence for text analysis..."
- After: "You are a text detective specializing in discovering hidden patterns, clues, and personal traits from writing..."

Output structure changes: `_parse_findings()` returns `clues` + `portrait` + `evidence` sections instead of flat forensic findings.

## 3. New Task Types

Two new task types added alongside the existing seven:

### `self_discovery` (Writing DNA)

| Field | Definition |
|-------|-----------|
| Input | Single-author text(s) |
| Not required | Comparison authors, candidates, suspects |
| Agent behavior | All agents run, prompts use "portrait" perspective |
| Output focus | Writing style traits, psychological tendencies, thinking patterns, social identity clues, emotional spectrum |
| Tone | 2nd person ("You tend to..."), friendly and readable |
| Comparable experience | MBTI / personality test report |

### `clue_extraction` (Clue Extraction)

| Field | Definition |
|-------|-----------|
| Input | One or more texts of unknown origin |
| Not required | Known author labels |
| Agent behavior | All agents run, prompts use "investigation" perspective |
| Output focus | Author's likely background, habits, education level, trackable linguistic markers, anomalous signals |
| Tone | 3rd person ("The text author exhibits..."), objective analysis |
| Comparable experience | OSINT intelligence brief |

### Full Task Type List (after repositioning)

1. `full` — Comprehensive analysis
2. `verification` — Source comparison
3. `closed_set_id` — Closed-set candidate identification
4. `open_set_id` — Open-set candidate identification
5. `clustering` — Unsupervised clustering
6. `profiling` — Writing portrait
7. `sockpuppet` — Sockpuppet detection
8. `self_discovery` — Writing DNA (NEW)
9. `clue_extraction` — Clue extraction (NEW)

## 4. Impact Scope

### Must Change

| Component | Change |
|-----------|--------|
| Agent system prompts (`agents/*.py`) | Reframe role, add clues/portrait/evidence output structure |
| `_parse_findings()` in `stylometry.py` | Return 3-layer structure instead of flat findings |
| `ingest/schema.py` | Add `self_discovery` and `clue_extraction` to `TaskType` enum |
| `product-overview.md` | Rewrite product positioning |
| `requirements.md` | Update to reflect new task types and output requirements |
| Frontend task config form | Add two new task type options |
| `CLAUDE.md` | Update project description |

### No Change

| Component | Reason |
|-----------|--------|
| Agent orchestration (`orchestrator.py`) | Same dispatch mechanism, all agents still run in parallel |
| Feature extraction pipeline (`features/`) | Same Rust + Python extraction, no new features needed |
| API route structure (`api/routers/`) | Existing routes handle new task types naturally |
| Report rendering skeleton (`report/`) | Same scroll/spine/atlas structure, content changes |
| SSE progress mechanism | No change needed |
| LLM backend configuration | No change needed |
| SQLite persistence (cache + store) | No change needed |

## 5. Design Decisions

1. **No UI restructuring** — The existing forensic scroll, evidence atlas, narrative spine stay. Only the content within them changes.
2. **All layers always present** — clues, portrait, evidence are never hidden based on task type. Users see everything and decide what to focus on.
3. **Perspective is the differentiator** — Task types differ in narrative tone (2nd vs 3rd person), not in information completeness.
4. **Backward compatible** — Existing 7 task types continue to work. Their agent outputs gain the new 3-layer structure as an enhancement.
5. **Product name unchanged** — "text" remains the product name.
