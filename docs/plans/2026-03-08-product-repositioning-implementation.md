# Product Repositioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reposition text from "forensic text analysis platform" to "text detective" — broadening output to include clues, portrait, and evidence layers across all task types, adding `self_discovery` and `clue_extraction` task types.

**Architecture:** Agent prompts shift from forensic expert to text detective persona. Every agent outputs findings tagged with a `layer` field (clue / portrait / evidence). Two new task types added to schema, orchestrator, and frontend. UI structure unchanged; only content and labels change.

**Tech Stack:** Python (Pydantic, pytest), TypeScript/React (Next.js, Zod), Tailwind CSS

---

## Task 1: Add finding layer to AgentFinding schema

**Files:**
- Modify: `src/text/ingest/schema.py` — `AgentFinding` model
- Test: `tests/test_schema_finding_layer.py`

**Step 1: Write the failing test**

```python
# tests/test_schema_finding_layer.py
from text.ingest.schema import AgentFinding, FindingLayer


def test_finding_layer_enum_values():
    assert FindingLayer.CLUE == "clue"
    assert FindingLayer.PORTRAIT == "portrait"
    assert FindingLayer.EVIDENCE == "evidence"


def test_finding_default_layer_is_clue():
    f = AgentFinding(
        discipline="stylometry",
        category="test",
        description="test desc",
        confidence=0.8,
        evidence=["e1"],
        metadata={},
    )
    assert f.layer == FindingLayer.CLUE


def test_finding_explicit_layer():
    f = AgentFinding(
        discipline="stylometry",
        category="test",
        description="test desc",
        confidence=0.8,
        evidence=[],
        metadata={},
        layer="portrait",
    )
    assert f.layer == FindingLayer.PORTRAIT
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_schema_finding_layer.py -v`
Expected: FAIL — `FindingLayer` not found

**Step 3: Write minimal implementation**

In `src/text/ingest/schema.py`, add `FindingLayer` enum and `layer` field to `AgentFinding`:

```python
class FindingLayer(str, Enum):
    CLUE = "clue"
    PORTRAIT = "portrait"
    EVIDENCE = "evidence"

# In AgentFinding, add field:
    layer: FindingLayer = FindingLayer.CLUE
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_schema_finding_layer.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/text/ingest/schema.py tests/test_schema_finding_layer.py
git commit -m "feat: add FindingLayer enum to AgentFinding schema"
```

---

## Task 2: Add new task types to Python schema

**Files:**
- Modify: `src/text/ingest/schema.py` — `TaskType` enum
- Test: `tests/test_schema_task_types.py`

**Step 1: Write the failing test**

```python
# tests/test_schema_task_types.py
from text.ingest.schema import TaskType


def test_self_discovery_task_type():
    assert TaskType.SELF_DISCOVERY == "self_discovery"


def test_clue_extraction_task_type():
    assert TaskType.CLUE_EXTRACTION == "clue_extraction"


def test_all_task_types_count():
    assert len(TaskType) == 9
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_schema_task_types.py -v`
Expected: FAIL — `SELF_DISCOVERY` not in TaskType

**Step 3: Write minimal implementation**

In `src/text/ingest/schema.py`, add to `TaskType` enum:

```python
class TaskType(str, Enum):
    VERIFICATION = "verification"
    CLOSED_SET_ID = "closed_set_id"
    OPEN_SET_ID = "open_set_id"
    CLUSTERING = "clustering"
    PROFILING = "profiling"
    SOCKPUPPET = "sockpuppet"
    FULL = "full"
    SELF_DISCOVERY = "self_discovery"
    CLUE_EXTRACTION = "clue_extraction"
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_schema_task_types.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/text/ingest/schema.py tests/test_schema_task_types.py
git commit -m "feat: add self_discovery and clue_extraction task types"
```

---

## Task 3: Update _parse_findings to support layer tagging

**Files:**
- Modify: `src/text/agents/stylometry.py` — `_parse_findings()` function
- Test: `tests/test_parse_findings_layer.py`

**Step 1: Write the failing test**

```python
# tests/test_parse_findings_layer.py
import json
from text.agents.stylometry import _parse_findings


def test_parse_findings_with_layer():
    raw = json.dumps([
        {
            "category": "writing_fingerprint",
            "description": "Test finding",
            "confidence": 0.8,
            "evidence": ["e1"],
            "interpretation": "Test",
            "layer": "portrait",
        }
    ])
    findings = _parse_findings(raw, "stylometry")
    assert findings[0].layer.value == "portrait"


def test_parse_findings_default_layer():
    raw = json.dumps([
        {
            "category": "test",
            "description": "No layer specified",
            "confidence": 0.7,
            "evidence": [],
            "interpretation": "Test",
        }
    ])
    findings = _parse_findings(raw, "stylometry")
    assert findings[0].layer.value == "clue"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_parse_findings_layer.py -v`
Expected: FAIL — `_parse_findings` does not handle `layer` field

**Step 3: Write minimal implementation**

In `_parse_findings()` in `src/text/agents/stylometry.py`, when constructing `AgentFinding`, extract `layer` from the parsed dict:

```python
from text.ingest.schema import FindingLayer

# Inside the loop in _parse_findings, add:
layer_raw = item.get("layer", "clue")
try:
    layer = FindingLayer(layer_raw)
except ValueError:
    layer = FindingLayer.CLUE

# Pass to AgentFinding constructor:
AgentFinding(
    ...existing fields...,
    layer=layer,
)
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_parse_findings_layer.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/text/agents/stylometry.py tests/test_parse_findings_layer.py
git commit -m "feat: support layer field in _parse_findings"
```

---

## Task 4: Update orchestrator task context for new task types

**Files:**
- Modify: `src/text/agents/orchestrator.py` — task context builder
- Test: `tests/test_orchestrator_task_context.py`

**Step 1: Write the failing test**

```python
# tests/test_orchestrator_task_context.py
from text.agents.orchestrator import OrchestratorAgent


def test_self_discovery_task_context():
    """Verify task context for self_discovery includes perspective hint."""
    # We test the _build_task_context helper or the context string generation
    # by checking the task_context output contains expected keywords.
    import text.agents.orchestrator as orch_mod

    # Access the TASK_GOALS dict or equivalent
    assert "self_discovery" in orch_mod._TASK_GOALS or hasattr(orch_mod, "_TASK_GOALS")


def test_clue_extraction_task_context():
    assert "clue_extraction" in orch_mod._TASK_GOALS
```

Note: The exact test depends on how task context is built. The implementor should read `orchestrator.py` to find the task goal mapping (likely a dict or if/elif chain around `request.task`) and write a test that validates the new entries produce correct context strings. If it's an if/elif chain, refactor to a dict first.

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_orchestrator_task_context.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

In `src/text/agents/orchestrator.py`, locate where `task_context` is built (the section that maps `request.task` to a goal description string). Add entries:

```python
# For self_discovery:
"self_discovery": (
    "Narrative perspective: second person (address the writer as '你').\n"
    "Goal: Build a comprehensive 'Writing DNA' portrait of the author — "
    "writing style fingerprint, psychological tendencies, cognitive patterns, "
    "social identity clues, and emotional spectrum. "
    "Output all findings with clue, portrait, and evidence layers."
),

# For clue_extraction:
"clue_extraction": (
    "Narrative perspective: third person (refer to the author as '文本作者').\n"
    "Goal: Extract investigative clues from the text — "
    "trackable linguistic markers, author background signals, behavioral anomalies, "
    "and any patterns useful for open-source intelligence analysis. "
    "Output all findings with clue, portrait, and evidence layers."
),
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_orchestrator_task_context.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/text/agents/orchestrator.py tests/test_orchestrator_task_context.py
git commit -m "feat: add task context for self_discovery and clue_extraction"
```

---

## Task 5: Update decision engine for new task types

**Files:**
- Modify: `src/text/decision/engine.py`

The `DecisionEngine.build_report()` likely has a match/if on `TaskType` to produce deterministic conclusions. The implementor should:

1. Read `engine.py` to find where task types are matched
2. Add handling for `self_discovery` and `clue_extraction` — both can follow a similar path to `profiling` (single-author focus, no pairwise comparison needed) or `full` (run everything)
3. For `self_discovery`: skip pairwise attribution conclusions, focus on per-author profiling
4. For `clue_extraction`: similar to `profiling` but without requiring known author labels

**Step 1: Read engine.py and identify task type dispatch**

Read: `src/text/decision/engine.py`

**Step 2: Add new task type handling**

The exact change depends on the dispatch mechanism. At minimum, ensure `self_discovery` and `clue_extraction` don't crash the decision engine. A safe default is to treat them like `profiling` (generate writing profiles, skip attribution conclusions).

**Step 3: Run existing tests**

Run: `pytest tests/ -k "decision or engine" -v`
Expected: PASS (no regressions)

**Step 4: Commit**

```bash
git add src/text/decision/engine.py
git commit -m "feat: handle self_discovery and clue_extraction in decision engine"
```

---

## Task 6: Rewrite Stylometry agent prompt

**Files:**
- Modify: `src/text/agents/stylometry.py` — `SYSTEM_PROMPT` constant

**Step 1: Read current prompt**

Read: `src/text/agents/stylometry.py` — locate `SYSTEM_PROMPT`

**Step 2: Rewrite prompt**

Key changes:
- Role: "expert forensic linguist specializing in stylometry" → "text detective specializing in writing fingerprint analysis"
- Framework: same 6 dimensions, but framed as "clues" and "patterns" rather than "forensic evidence"
- Output: require each finding to have a `"layer"` field with value `"clue"`, `"portrait"`, or `"evidence"`
  - `clue`: trackable signals, anomalies, distinctive patterns that could identify or link authors
  - `portrait`: characterization of the writer's habits, style personality, stable traits
  - `evidence`: specific data points, metrics, text excerpts that support the clue/portrait
- Interpretation field: keep the requirement for plain Chinese one-liner, but make it more accessible (not forensic jargon)
- Add instruction: "When task context specifies '2nd person perspective', address the writer as '你'. Otherwise use 3rd person."

**Step 3: Verify no syntax errors**

Run: `python -c "from text.agents.stylometry import StylometryAgent; print('OK')"`
Expected: OK

**Step 4: Run existing tests**

Run: `pytest tests/ -k stylometry -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/text/agents/stylometry.py
git commit -m "feat: rewrite stylometry prompt for text detective positioning"
```

---

## Task 7: Rewrite Psycholinguistics agent prompt

**Files:**
- Modify: `src/text/agents/psycholinguistics.py` — `SYSTEM_PROMPT` constant

**Step 1: Read current prompt**

Read: `src/text/agents/psycholinguistics.py` — locate `SYSTEM_PROMPT`

**Step 2: Rewrite prompt**

Key changes:
- Role: "forensic psycholinguistics analyst" → "text detective specializing in psychological portrait analysis"
- Keep two-layer structure (observable vs. subjective) — this maps well to the new model:
  - Observable → `layer: "evidence"` (data-backed observations)
  - Subjective → `layer: "portrait"` (interpretive character traits)
  - Cross-cutting insights → `layer: "clue"` (actionable signals)
- Add `"layer"` field requirement to output JSON
- Add perspective instruction (2nd/3rd person based on task context)
- Keep all existing guardrails (no gender/age/identity inference, subjective hypothesis labeling)

**Step 3-5: Same verification and commit pattern as Task 6**

```bash
git add src/text/agents/psycholinguistics.py
git commit -m "feat: rewrite psycholinguistics prompt for text detective positioning"
```

---

## Task 8: Rewrite Sociolinguistics agent prompt

**Files:**
- Modify: `src/text/agents/sociolinguistics.py` — `SYSTEM_PROMPT` constant

**Step 2: Rewrite prompt**

Key changes:
- Role: "forensic sociolinguistics analyst" → "text detective specializing in social identity and community analysis"
- Same layer mapping as psycholinguistics:
  - Observable social signals → `layer: "evidence"`
  - Subjective social hypotheses → `layer: "portrait"`
  - Trackable community markers → `layer: "clue"`
- Add `"layer"` field requirement
- Add perspective instruction

**Step 3-5: Same pattern**

```bash
git add src/text/agents/sociolinguistics.py
git commit -m "feat: rewrite sociolinguistics prompt for text detective positioning"
```

---

## Task 9: Rewrite Computational agent prompt

**Files:**
- Modify: `src/text/agents/computational.py` — `SYSTEM_PROMPT` constant

**Step 2: Rewrite prompt**

Key changes:
- Role: "computational linguist specializing in quantitative text analysis, authorship attribution, and forensic text comparison" → "text detective specializing in computational pattern discovery and quantitative analysis"
- Same 6 dimensions, reframed:
  1. Semantic Similarity → "Cross-text association signals"
  2. Topic Distribution → "Topic fingerprint"
  3. Anomaly Detection → "Anomalous pattern flags"
  4. Clustering → "Natural grouping discovery"
  5. Statistical Outliers → "Statistical signal detection"
  6. Cross-Validation → "Pattern reliability check"
- Auto-findings from Phase 1 (deterministic): set `layer: "evidence"` by default
- LLM-interpreted findings: require `"layer"` field in JSON output
- Add perspective instruction

**Important**: The `_compute_statistics()` method generates auto_findings with `opinion_kind="deterministic_evidence"`. These should get `layer=FindingLayer.EVIDENCE` automatically. Add this default in the auto-finding construction code.

**Step 3-5: Same pattern**

```bash
git add src/text/agents/computational.py
git commit -m "feat: rewrite computational prompt for text detective positioning"
```

---

## Task 10: Rewrite Synthesis agent prompt

**Files:**
- Modify: `src/text/agents/synthesis.py` — `SYSTEM_PROMPT` constant

**Step 2: Rewrite prompt**

Key changes:
- Role: "senior forensic analyst writing a court-aware summary" → "senior text detective writing a comprehensive investigation summary"
- Keep all existing guardrails (never invent/upgrade deterministic grades, cautious language)
- Narrative section keys stay the same: `bottom_line`, `evidence_chain`, `conflicts`, `limitations`, `next_actions`
- Reframe language:
  - "court-aware" → "actionable"
  - "forensic" → "investigative"
  - The summary should read like a detective's case notes, not a lab report
- Add perspective instruction: match the perspective from task context (2nd person for self_discovery, 3rd person for others)
- For `self_discovery` tasks, `bottom_line` should feel like a personality/writing profile reveal, not a forensic conclusion

**Step 3-5: Same pattern**

```bash
git add src/text/agents/synthesis.py
git commit -m "feat: rewrite synthesis prompt for text detective positioning"
```

---

## Task 11: Frontend — Add new task types to TypeScript types

**Files:**
- Modify: `web/src/lib/types.ts`

**Step 1: Add new values to TaskType union**

```typescript
export type TaskType =
  | "verification"
  | "closed_set_id"
  | "open_set_id"
  | "clustering"
  | "profiling"
  | "sockpuppet"
  | "full"
  | "self_discovery"
  | "clue_extraction";
```

**Step 2: Verify build**

Run: `cd web && npx tsc --noEmit`
Expected: PASS (no type errors — new values are additive)

**Step 3: Commit**

```bash
git add web/src/lib/types.ts
git commit -m "feat: add self_discovery and clue_extraction to TaskType"
```

---

## Task 12: Frontend — Config form + i18n for new task types

**Files:**
- Modify: `web/src/components/analysis/config-form.tsx` — `TASK_OPTIONS` array + Zod schema + dynamic fields
- Modify: `web/src/components/providers/i18n-provider.tsx` — translation entries

**Step 1: Add i18n entries**

In `i18n-provider.tsx`, add to both `en` and `zh` message objects:

```typescript
// EN
"config.task.self_discovery.label": "Writing DNA",
"config.task.self_discovery.desc": "Discover your writing fingerprint — style traits, psychological patterns, and hidden habits revealed through your text",
// ZH
"config.task.self_discovery.label": "文字 DNA",
"config.task.self_discovery.desc": "发现你的文字指纹——风格特征、心理模式与隐藏在文本中的习惯",

// EN
"config.task.clue_extraction.label": "Clue Extraction",
"config.task.clue_extraction.desc": "Extract investigative clues from text — author background signals, behavioral patterns, and trackable linguistic markers",
// ZH
"config.task.clue_extraction.label": "线索提取",
"config.task.clue_extraction.desc": "从文本中提取调查线索——作者背景信号、行为模式与可追踪的语言标记",
```

**Step 2: Add to TASK_OPTIONS in config-form.tsx**

```typescript
{ value: "self_discovery" as TaskType, labelKey: "config.task.self_discovery.label", descriptionKey: "config.task.self_discovery.desc" },
{ value: "clue_extraction" as TaskType, labelKey: "config.task.clue_extraction.label", descriptionKey: "config.task.clue_extraction.desc" },
```

**Step 3: Update Zod schema**

Add `"self_discovery"` and `"clue_extraction"` to the `z.enum()` array.

**Step 4: Add dynamic form fields for new types**

In the Scope card's conditional rendering:
- `self_discovery`: show `subject_ids` field (same as profiling — which author's texts to analyze). If only one author in the uploaded data, auto-select.
- `clue_extraction`: show minimal config — no required fields beyond the uploaded texts. Similar to `full` but with a different description.

**Step 5: Verify build**

Run: `cd web && npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add web/src/components/analysis/config-form.tsx web/src/components/providers/i18n-provider.tsx
git commit -m "feat: add self_discovery and clue_extraction to config form and i18n"
```

---

## Task 13: Frontend — Update hardcoded task and agent labels

**Files:**
- Modify: `web/src/components/report/confidence-overview.tsx` — `taskLabel()` function
- Modify: `web/src/components/report/agent-section.tsx` — `AGENT_LABELS` (optional branding update)

**Step 1: Update taskLabel() in confidence-overview.tsx**

Add entries:

```typescript
case "self_discovery": return "文字 DNA";
case "clue_extraction": return "线索提取";
```

**Step 2: (Optional) Update AGENT_LABELS in agent-section.tsx**

Consider rebranding agent display names to match detective positioning:

```typescript
const AGENT_LABELS: Record<string, string> = {
  stylometry: "Writing Fingerprint",       // was "Stylometry"
  writing_process: "Psychological Portrait", // was "Psycholinguistics"
  computational: "Pattern Analysis",        // was "Computational"
  sociolinguistics: "Social Identity",      // was "Sociolinguistics"
};
```

This is optional — the user may prefer to keep academic names. The implementor should ask or use the new names.

**Step 3: Verify build**

Run: `cd web && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add web/src/components/report/confidence-overview.tsx web/src/components/report/agent-section.tsx
git commit -m "feat: update task and agent labels for detective positioning"
```

---

## Task 14: Rewrite product-overview.md

**Files:**
- Modify: `docs/product/product-overview.md`

**Step 1: Rewrite**

Refer to the design doc at `docs/plans/2026-03-08-product-repositioning-design.md` for the new positioning. Key changes:

- **Product positioning**: "text detective" — give it any text, it pulls out hidden clues
- **Target users**: anyone curious about the story behind text (general public for self-discovery, OSINT investigators for clue extraction, professional analysts for attribution/detection)
- **Core capabilities**: reframe existing capabilities + add self_discovery and clue_extraction
- **Typical scenarios**: add "Writing DNA self-discovery" and "OSINT clue extraction" alongside existing forensic scenarios
- **Product boundaries**: still focused on text intelligence, does not do crawling/scraping

**Step 2: Commit**

```bash
git add docs/product/product-overview.md
git commit -m "docs: rewrite product overview for text detective positioning"
```

---

## Task 15: Update requirements.md

**Files:**
- Modify: `docs/product/requirements.md`

**Step 1: Update**

- Add `self_discovery` and `clue_extraction` to supported task types list
- Add output requirement: all findings include `layer` field (clue / portrait / evidence)
- Add narrative perspective requirement: 2nd person for self_discovery, 3rd person for others
- Update non-functional requirement "可解释性": findings are organized as clues, portraits, and evidence

**Step 2: Commit**

```bash
git add docs/product/requirements.md
git commit -m "docs: update requirements for new task types and finding layers"
```

---

## Task 16: Update CLAUDE.md project description

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update**

Change the project overview from forensic-focused to detective-focused:
- "基于多智能体协作的数字取证文本分析系统" → "基于多智能体协作的文本侦探与智能分析平台"
- Update task type list to include 9 types
- Mention `FindingLayer` in data model section
- Update agent descriptions to match new positioning

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for text detective positioning"
```

---

## Task 17: Run full test suite and build check

**Step 1: Python tests**

Run: `pytest tests/ -v`
Expected: PASS

**Step 2: Frontend build**

Run: `cd web && npm run build`
Expected: PASS

**Step 3: Python lint**

Run: `ruff check src/ && ruff format --check src/`
Expected: PASS

**Step 4: Frontend lint**

Run: `cd web && npm run lint`
Expected: PASS

---

## Dependency Graph

```
Task 1 (FindingLayer schema) ──┐
Task 2 (TaskType schema)  ─────┤
                                ├─→ Task 3 (_parse_findings layer) ─→ Tasks 6-10 (agent prompts)
                                ├─→ Task 4 (orchestrator context) ─→ Task 5 (decision engine)
                                └─→ Task 11 (TS types) ─→ Task 12 (config+i18n) ─→ Task 13 (labels)
Tasks 6-10, 13 ─────────────────→ Tasks 14-16 (docs)
All ────────────────────────────→ Task 17 (full test suite)
```

Tasks 1-2 can run in parallel. Tasks 6-10 can run in parallel. Tasks 11-13 can run after Tasks 1-2. Tasks 14-16 can run in parallel after agent prompts are done.
