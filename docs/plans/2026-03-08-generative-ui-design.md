# Generative UI Chat Integration Design

## Overview

Integrate AI SDK Generative User Interfaces into the existing QA chat feature, enabling the LLM to render rich UI components (charts, tables, heatmaps, radar charts) within chat messages via tool calling.

## Architecture

### Approach: Python Backend Emits AI SDK Tool Frames

**Constraint**: `next.config.ts` uses `output: "export"` for Tauri desktop build — Next.js API routes are unavailable in production.

```
User question → Python POST /qa/chat → LiteLLM tool-calling (Claude native)
  → LLM decides:
    ├─ Text response → text stream frames → Markdown
    ├─ "show distribution" → tool-call + tool-result frames → BarChart/LineChart
    ├─ "compare profiles" → tool-call + tool-result frames → RadarChart
    ├─ "list evidence" → tool-call + tool-result frames → DataTable
    └─ "similarity matrix" → tool-call + tool-result frames → Heatmap
```

- **LLM Provider**: LiteLLM (existing Python backend, supports Claude tool calling)
- **Report Context**: Built in Python (existing `_build_report_context()`)
- **Stream Protocol**: AI SDK UI Message Stream v1 with `tool-call` + `tool-result` frames
- **Frontend**: `useChat` with `tool-${toolName}` part rendering (unchanged)

### Why This Approach

- Works with static export (`output: "export"`) — no Next.js API routes needed
- Single backend (Python) — no dual maintenance
- LLM autonomously decides the best presentation format via native tool calling
- Reuses existing Recharts/shadcn infrastructure on the frontend

## Tools Definition

| Tool Name | Input Schema | Purpose |
|-----------|-------------|---------|
| `displayChart` | `{ type: "line"\|"bar", title, data: Record[], xKey, yKeys, yLabels? }` | Line/bar charts |
| `displayRadar` | `{ title, dimensions: string[], series: { name, values: number[] }[] }` | Radar charts |
| `displayTable` | `{ title, headers: { key, label }[], rows: Record[] }` | Data tables |
| `displayHeatmap` | `{ title, rowLabels, colLabels, matrix: number[][] }` | Heatmaps |

All tools execute as passthrough — `execute: async (params) => params`.

## Frontend Changes

### Transport

Replace custom `DefaultChatTransport` (pointing to Python `qaChatUrl`) with standard transport pointing to `/api/chat`. Pass `analysisId` in request body.

### Message Rendering

Add tool part rendering alongside existing text rendering:

```
message.parts.map(part => {
  text         → Markdown (react-markdown)
  tool-displayChart   → <ChatChart />   (loading → result)
  tool-displayRadar   → <ChatRadar />   (loading → result)
  tool-displayTable   → <ChatTable />   (loading → result)
  tool-displayHeatmap → <ChatHeatmap /> (loading → result)
})
```

Tool parts have states: `partial-call` → `call` → `result`. Show skeleton during loading.

### Remove Legacy Data Parts

- Remove `reportSnapshot` and `reportFocus` data part schemas and rendering
- LLM's tool-calling replaces keyword-based focus card matching

### New Components (`web/src/components/chat/`)

| Component | Based On | Notes |
|-----------|----------|-------|
| `chat-chart.tsx` | Recharts + shadcn ChartContainer | Line/bar, 100% width, ~250px height |
| `chat-radar.tsx` | Recharts RadarChart | Multi-series support |
| `chat-table.tsx` | shadcn Table | Responsive, fits chat bubble |
| `chat-heatmap.tsx` | CSS Grid + color scale | Reuses similarity-heatmap logic |

## Backend

### Python: Zero Changes

- `GET /api/v1/analyses/{id}` — already exists, used by Next.js route to fetch report
- `POST /qa/chat` — kept but no longer called by frontend
- `POST /qa/suggestions` — still used for suggestion chips

### Next.js Config

- `/api/chat` is a Next.js API route — does NOT go through the `/api/v1/*` proxy rewrite
- No rewrite changes needed

### New Dependency

- `@ai-sdk/anthropic` — Claude provider for AI SDK

### Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...          # Required for LLM
TEXT_API_ORIGIN=http://127.0.0.1:8000  # Existing, used to fetch report
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| Python backend unreachable | Next.js returns 500, useChat error state displays it |
| API key missing/invalid | Returns 401, frontend shows config prompt |
| LLM tool-calling format error | AI SDK handles gracefully, falls back to text |
| Stream connection lost | useChat built-in reconnection |

## File Changes

### Modified

- `web/src/components/report/report-qa-panel.tsx` — transport switch + tool parts rendering
- `web/package.json` — add `@ai-sdk/anthropic`

### New

- `web/src/app/api/chat/route.ts` — Next.js API route
- `web/src/ai/tools.ts` — tool definitions
- `web/src/ai/report-context.ts` — report context builder
- `web/src/components/chat/chat-chart.tsx`
- `web/src/components/chat/chat-radar.tsx`
- `web/src/components/chat/chat-table.tsx`
- `web/src/components/chat/chat-heatmap.tsx`

### Unchanged

- All Python backend code
- Existing visualization components (new chat-specific versions created)
