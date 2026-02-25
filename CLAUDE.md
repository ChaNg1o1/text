# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Text —— 基于多智能体协作的数字取证文本分析系统。结合 Rust 高性能特征提取与 Python NLP + LLM 多智能体推理，提供作者归属分析、作者画像、傀儡账号检测等能力。所有面向用户的输出使用简体中文。

## 构建与开发

```bash
# Python 依赖
pip install -e ".[dev]"          # 核心 + 开发工具
pip install -e ".[web]"          # FastAPI/uvicorn API 依赖

# Rust 扩展（修改 crates/ 下代码后必须重新执行）
maturin develop

# NLP 模型
python -m spacy download en_core_web_sm
```

### 运行

```bash
# CLI 分析
text analyze full sample/xueqiu_cleaned_stylometry.txt --llm claude
text analyze attribution data/ --compare "alice,bob" --format json --output report.json
text analyze profiling data/ --author alice
text analyze sockpuppet data/ --suspects "alice,bob"
text extract sample/xueqiu_cleaned_stylometry.txt --output features.json

# 系统配置
text config info              # 组件状态
text config backends          # 可用 LLM 后端
text config cache status      # 缓存状态
text config cache clear       # 清除缓存

# API 服务
text serve --reload --port 8000

# Web 前端（另开终端）
cd web && npm install && npm run dev    # http://localhost:3000
```

### 测试与质量

```bash
pytest tests/                       # Python 测试（asyncio_mode = "auto"）
pytest tests/test_xxx.py -v         # 单个测试文件
cargo test --workspace              # Rust 测试
ruff check src/ && ruff format --check src/   # Python lint
cd web && npm run lint && npm run build       # 前端 lint + 构建检查
```

## 架构

### 处理管道

```
输入文本 → 数据摄取(ingest) → 特征提取(features) → 多智能体并行分析(agents) → 综合报告(report)
```

### 混合 Rust + Python 核心

- **Rust crate** (`crates/tf-features/`): 通过 PyO3 暴露为 `text._tf_features`，Rayon 并行提取词法/句法/字符级/Unicode 特征。修改后需 `maturin develop` 重新编译。
- **Python 包** (`src/text/`): 数据摄取、NLP 特征提取（spaCy + sentence-transformers + LIWC）、LLM 调用、多智能体分析、报告渲染。

### 关键模块

| 模块 | 职责 |
|------|------|
| `cli/main.py` | Typer CLI 入口，分组命令：`analyze`、`extract`、`config`、`serve` |
| `ingest/schema.py` | Pydantic 数据模型：`TextEntry`, `AnalysisRequest`, `FeatureVector`, `ForensicReport` 等 |
| `ingest/loader.py` | 多格式加载器（CSV/JSON/JSONL/TXT） |
| `features/extractor.py` | 特征提取编排，协调 Rust 与 Python NLP 管道 |
| `features/cache.py` | SQLite 特征缓存（BLAKE2b 内容哈希），存储于 `~/.cache/text/` |
| `llm/backend.py` | LLM API 抽象层，通过 LiteLLM 支持多供应商 |
| `agents/orchestrator.py` | 多智能体调度器，`asyncio.gather()` 并行执行 4 个专业 Agent |
| `agents/stylometry.py` | 文体计量学 Agent + **共享 LLM 工具函数**（`_call_llm`, `_fmt_dict`, `_parse_findings`） |
| `agents/computational.py` | 计算语言学 Agent（含本地统计：余弦相似度、DBSCAN 聚类、z-score） |
| `agents/synthesis.py` | 综合 Agent：交叉验证、矛盾识别、置信度校准 |
| `report/renderer.py` | Markdown / JSON / Rich 终端报告渲染 |

### FastAPI 服务 (`src/text/api/`)

| 组件 | 职责 |
|------|------|
| `app.py` | 应用工厂 `create_app()`，lifespan 初始化 `AnalysisStore` + `ProgressManager` |
| `config.py` | `pydantic-settings` 配置，`TEXT_` 前缀环境变量 |
| `routers/analyses.py` | `POST /api/v1/analyses`（202 + 后台任务）、列表、详情、删除 |
| `routers/progress.py` | `GET /api/v1/analyses/{id}/progress` — SSE 流式进度 |
| `routers/backends.py` | LLM 后端 CRUD、连接测试 |
| `routers/uploads.py` | 多格式文件上传解析 |
| `services/analysis_runner.py` | `InstrumentedOrchestrator` 子类包装核心 Agent，注入 SSE 事件发射 |
| `services/progress_manager.py` | `asyncio.Queue` 扇出 SSE 事件总线 |
| `services/analysis_store.py` | SQLite（WAL 模式）分析记录 CRUD |

### Next.js 前端 (`web/`)

- **Next.js 16** + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- 通过 `next.config.ts` 的 `rewrites` 将 `/api/v1/*` 代理到 Python 后端（默认 `http://127.0.0.1:8000`，可通过 `TEXT_API_ORIGIN` 配置）
- 实时进度：`EventSource` SSE → `useSSEProgress` hook → Zustand store
- i18n：`i18n-provider.tsx` 内联翻译字典（中/英），无外部 i18n 框架
- 主要路由：`/analyses`（列表）、`/analyses/new`（新建）、`/analyses/[id]`（详情/报告）、`/analyses/[id]/features`（特征浏览）、`/settings/backends`（后端管理）

### 重要设计特征

- **Agent 共享 LLM 工具**：`_call_llm()` / `_parse_findings()` / `_fmt_dict()` 定义在 `stylometry.py`，被所有 Agent 导入。
- **优雅降级**：scikit-learn、spaCy 模型、Rust 扩展均为可选依赖，缺失时跳过而非崩溃。Agent 失败时返回中文降级报告。
- **异步管道**：特征提取和 Agent 分析均为 async，CLI 通过 `asyncio.run()` 驱动。
- **SSE 进度机制**：`InstrumentedOrchestrator` 通过子类+包装注入 SSE 事件，不修改核心 Agent 代码。
- **双 SQLite 持久化**：特征缓存 `~/.cache/text/features.db` + 分析记录 `~/.cache/text/analyses.db`，均用 WAL 模式。

### LLM 后端配置

通过 `backends.json`（参考 `backends.example.json`）配置自定义后端。内置支持 claude / gpt4 / gpt4-mini / local，自定义后端通过 LiteLLM 的 `openai_compatible` / `anthropic_compatible` provider 接入。API Key 通过环境变量注入（`api_key_env` 字段）。运行时后端配置存储于 `~/.config/text/backends.json`。

## 编码约定

- Python >= 3.11，Ruff lint + format（line-length=100）
- Rust edition 2021，PyO3 0.24 + abi3
- TypeScript/React：组件 `PascalCase`，hooks 以 `use` 开头
- 测试框架：pytest + pytest-asyncio（`asyncio_mode = "auto"`）
- 数据模型统一使用 Pydantic v2
- 提交信息遵循 Conventional Commits 风格（如 `refactor: normalize CLI with grouped subcommands`）
- 不要提交 `backends.json`、API keys、`.env` 等敏感信息
