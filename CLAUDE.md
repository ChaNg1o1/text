# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Text Forensics Platform —— 基于多智能体协作的数字取证文本分析系统。结合 Rust 高性能特征提取与 Python NLP + LLM 多智能体推理，提供作者归属分析、作者画像、傀儡账号检测等能力。所有面向用户的输出使用简体中文。

## 构建与开发

```bash
# 安装 Python 依赖（含 dev 依赖）
pip install -e ".[dev]"

# 编译 Rust 扩展并安装到当前 Python 环境（开发模式）
maturin develop

# 仅编译 Rust 扩展（release）
maturin build --release

# 下载 spaCy 模型（NLP 特征提取需要）
python -m spacy download en_core_web_sm
```

### 运行

```bash
# 完整分析
text analyze sample/xueqiu_cleaned_stylometry.txt --task full --llm claude

# 仅提取特征（不调用 LLM）
text features sample/xueqiu_cleaned_stylometry.txt --output features.json

# 查看可用后端与组件状态
text backends
text info
```

### 测试与质量

```bash
# 运行测试
pytest tests/

# 运行单个测试文件
pytest tests/test_xxx.py -v

# 异步测试已配置 asyncio_mode = "auto"，无需额外标记

# Rust 测试
cargo test --workspace

# Lint
ruff check src/
ruff format --check src/
```

## 架构

### 处理管道

```
输入文本 → 数据摄取(ingest) → 特征提取(features) → 多智能体分析(agents) → 综合报告(report)
```

### 混合 Rust + Python 结构

- **Rust crate** (`crates/tf-features/`): 通过 PyO3 暴露为 Python 模块 `text._tf_features`，使用 Rayon 并行提取词法、句法、字符级、Unicode 特征。修改后需 `maturin develop` 重新编译。
- **Python 包** (`src/text/`): 数据摄取、NLP 特征提取（spaCy + sentence-transformers + LIWC）、LLM 调用、多智能体分析、报告渲染。

### 关键模块

| 模块 | 职责 |
|------|------|
| `cli/main.py` | Typer CLI 入口，`text analyze` / `text features` / `text backends` / `text info` |
| `ingest/schema.py` | Pydantic 数据模型：`TextEntry`, `AnalysisRequest`, `FeatureVector`, `ForensicReport` 等 |
| `ingest/loader.py` | 多格式加载器（CSV/JSON/JSONL/TXT） |
| `features/extractor.py` | 特征提取编排，协调 Rust 与 Python NLP 管道 |
| `features/cache.py` | SQLite 特征缓存（SHA256 内容哈希去重），存储于 `~/.cache/text/` |
| `llm/backend.py` | LLM API 抽象层，通过 LiteLLM 支持多供应商 |
| `agents/orchestrator.py` | 多智能体调度器，`asyncio.gather()` 并行执行 4 个专业 Agent |
| `agents/stylometry.py` | 文体计量学 Agent + **共享 LLM 工具函数**（`_call_llm`, `_fmt_dict`, `_parse_findings`） |
| `agents/psycholinguistics.py` | 心理语言学 Agent |
| `agents/sociolinguistics.py` | 社会语言学 Agent |
| `agents/computational.py` | 计算语言学 Agent（含本地统计计算：余弦相似度、DBSCAN 聚类、z-score） |
| `agents/synthesis.py` | 综合 Agent：交叉验证、矛盾识别、置信度校准 |
| `report/renderer.py` | Markdown / JSON / Rich 终端报告渲染 |

### LLM 后端配置

通过 `backends.json`（参考 `backends.example.json`）配置自定义后端。内置支持 claude / gpt4 / gpt4-mini / local，自定义后端通过 LiteLLM 的 `openai_compatible` / `anthropic_compatible` provider 接入。API Key 通过环境变量注入（`api_key_env` 字段）。

### 重要设计特征

- **所有 Agent 共享 LLM 调用工具**：定义在 `stylometry.py` 中的 `_call_llm()` / `_parse_findings()` / `_fmt_dict()` 被其他所有 Agent 导入使用。
- **优雅降级**：scikit-learn、spaCy 模型、Rust 扩展均为可选依赖，缺失时相关功能跳过而非崩溃。Agent 分析失败时返回包含中文错误信息的降级报告。
- **异步管道**：特征提取和 Agent 分析均为 async，CLI 通过 `asyncio.run()` 驱动。

## 编码约定

- Python >= 3.11，Ruff lint + format（line-length=100）
- Rust edition 2021，PyO3 0.24 + abi3
- 测试框架：pytest + pytest-asyncio
- 数据模型统一使用 Pydantic v2
