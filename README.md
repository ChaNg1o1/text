<div align="center">

<img src="src/text/icon/text.png" alt="Text Forensics" width="250" />

**多Agent协作的数字取证文本分析工具**

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-Edition%202021-CE412B?logo=rust&logoColor=white)](https://rust-lang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

结合 Rust 高性能特征提取与 LLM 多智能体推理，为作者身份鉴定、傀儡账号检测等数字取证场景提供高置信度分析报告。

</div>

---

## 目录

- [目录](#目录)
- [核心能力](#核心能力)
- [系统架构](#系统架构)
  - [处理管道](#处理管道)
  - [多智能体分工](#多智能体分工)
  - [技术栈](#技术栈)
- [快速开始](#快速开始)
  - [前置依赖](#前置依赖)
  - [安装](#安装)
  - [配置 LLM 后端](#配置-llm-后端)
  - [运行分析](#运行分析)
- [CLI 参考](#cli-参考)
- [Web 界面](#web-界面)
- [输入格式](#输入格式)
- [配置说明](#配置说明)
  - [LLM 后端（`backends.json`）](#llm-后端backendsjson)
  - [环境变量](#环境变量)
- [项目结构](#项目结构)

---

## 核心能力

| 功能 | 描述 |
|------|------|
| **作者归属分析** | 判定文本是否由同一作者撰写，识别独特的写作指纹 |
| **作者画像** | 构建语言学画像，推断人口统计特征、心理特质与社会背景 |
| **傀儡账号检测** | 检测多个账号是否由同一自然人运营 |
| **综合取证分析** | 整合四维语言学视角，输出带置信度的全面取证报告 |

---

## 系统架构

### 处理管道

```
输入文本
    │
    ▼
数据摄取（CSV / JSON / JSONL / TXT）
    │
    ▼
特征提取  ←── SQLite 缓存（BLAKE2b 内容哈希）
  ├── Rust 层：词法 / 句法 / n-gram / Unicode（Rayon 并行）
  └── Python 层：spaCy NLP / 语义嵌入 / LIWC
    │
    ▼
多智能体并行分析（asyncio.gather）
  ├── Stylometry Agent         — 文体计量学
  ├── Psycholinguistics Agent  — 心理语言学
  ├── Sociolinguistics Agent   — 社会语言学
  └── Computational Agent      — 计算语言学
    │
    ▼
Synthesis Agent（交叉验证 · 置信度校准 · 矛盾识别）
    │
    ▼
取证报告（Markdown / JSON / Rich 终端）
```

### 多智能体分工

| Agent | 学科领域 | 主要分析维度 |
|-------|----------|------------|
| **Stylometry** | 文体计量学 | 句长分布、TTR、Yule's K、标点模式、字符 n-gram 指纹 |
| **Psycholinguistics** | 心理语言学 | LIWC 维度、Big Five 推断、情感效价、认知复杂度 |
| **Sociolinguistics** | 社会语言学 | 正式度、代码转换、社交风格、地域标记、emoji 模式 |
| **Computational** | 计算语言学 | 余弦相似度矩阵、DBSCAN 聚类、z-score 异常检测 |
| **Synthesis** | 跨学科综合 | 交叉验证、矛盾识别、置信度计算、行动建议 |

### 技术栈

**Rust 高性能层（`crates/tf-features`）**

| 组件 | 作用 |
|------|------|
| PyO3 0.24 | Rust ↔ Python 绑定 |
| Rayon 1.10 | 并行特征提取 |
| unicode-segmentation 1.12 | Unicode 文本分割 |
| regex / rustc-hash / serde | 正则、哈希、序列化 |

**Python 分析层（`src/text`）**

| 组件 | 作用 |
|------|------|
| Typer ≥ 0.15 + Rich ≥ 13 | CLI 与终端 UI |
| Pydantic v2 | 数据模型与验证 |
| LiteLLM ≥ 1.60 | 统一 LLM API 接口 |
| spaCy ≥ 3.8 | NLP 管道（POS、依存分析） |
| sentence-transformers ≥ 3 | 语义嵌入向量 |
| scikit-learn ≥ 1.6 | 聚类与相似度计算 |
| aiosqlite ≥ 0.21 | 异步特征缓存 |
| FastAPI ≥ 0.115 + uvicorn | REST API 服务 |

---

## 快速开始

### 前置依赖

- Python ≥ 3.11
- Rust 工具链（[rustup.rs](https://rustup.rs)）
- 至少一个可用的 LLM 后端

### 安装

```bash
# 克隆项目
git clone https://github.com/ChaNg1o1/text.git
cd text

# 安装 Python 依赖（含开发工具）
pip install -e ".[dev]"

# 编译并安装 Rust 特征提取扩展
maturin develop

# 下载 spaCy 英文语言模型
python -m spacy download en_core_web_sm
```

### 配置 LLM 后端

```bash
cp backends.example.json backends.json
# 编辑 backends.json，填入 API Key 或配置自定义端点
```

### 运行分析

```bash
# 综合取证分析（默认 Rich 终端输出）
text analyze full sample/input.txt --llm deepseek

# 作者归属分析（CSV 输入，JSON 输出到文件）
text analyze attribution data/texts.csv --compare "alice,bob" --llm claude --format json --output report.json

# 傀儡账号检测
text analyze sockpuppet data/posts.jsonl --suspects "user_a,user_b" --llm qwen

# 作者画像
text analyze profiling data/ --author alice --llm deepseek

# 仅提取特征（不调用 LLM）
text extract sample/input.txt --output features.json
```

---

## CLI 参考

```
text
├── analyze
│   ├── full          综合取证分析
│   ├── attribution   作者归属分析
│   ├── profiling     作者画像构建
│   └── sockpuppet    傀儡账号检测
├── extract           特征提取（不调用 LLM）
└── config
    ├── info          查看系统组件状态
    ├── backends      列出可用 LLM 后端
    └── cache
        ├── status    查看缓存状态
        └── clear     清除特征缓存
```

**通用选项**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--llm` | 指定 LLM 后端名称 | `claude` |
| `--format` | 输出格式 `rich / json / markdown` | `rich` |
| `--output` | 输出文件路径 | 标准输出 |

---

## Web 界面

项目提供 FastAPI REST API 与 Next.js 前端，可通过浏览器提交分析任务并查看报告。

```bash
# 安装 API 服务依赖并启动
pip install -e ".[web]"
text serve --reload --port 8000

# 启动前端开发服务器（另开终端）
cd web && npm install && npm run dev
# 访问 http://localhost:3000
```

---

## 输入格式

| 格式 | 说明 |
|------|------|
| `.txt` | 纯文本，整个文件视为单条记录 |
| `.csv` | 需含 `author` 与 `content` 列 |
| `.json` | 对象数组，需含 `author` 与 `content` 字段 |
| `.jsonl` | 每行一个 JSON 对象，需含 `author` 与 `content` 字段 |
| 目录路径 | 批量加载目录下所有支持格式的文件 |

---

## 配置说明

### LLM 后端（`backends.json`）

```json
{
  "backends": {
    "deepseek": {
      "provider": "openai_compatible",
      "model": "deepseek-chat",
      "api_base": "https://api.deepseek.com/v1",
      "api_key_env": "DEEPSEEK_API_KEY"
    },
    "ollama-local": {
      "provider": "openai_compatible",
      "model": "llama3",
      "api_base": "http://localhost:11434/v1"
    }
  }
}
```

预置后端（见 `backends.example.json`）：DeepSeek、Qwen、GLM-4、Moonshot、Yi、Azure OpenAI、Together AI、Ollama。

### 环境变量

```bash
ANTHROPIC_API_KEY=sk-ant-xxx     # Anthropic Claude
OPENAI_API_KEY=sk-xxx            # OpenAI / Azure
DEEPSEEK_API_KEY=sk-xxx          # DeepSeek
DASHSCOPE_API_KEY=sk-xxx         # 通义千问（阿里云）
ZHIPU_API_KEY=xxx                # 智谱 GLM
MOONSHOT_API_KEY=sk-xxx          # Moonshot Kimi
SILICONFLOW_API_KEY=sk-xxx       # SiliconFlow
```

> 也可在 `backends.json` 中直接设置 `"api_key"` 字段（不推荐提交至版本控制）。

---

## 项目结构

```
text/
├── crates/tf-features/           # Rust 扩展（PyO3 → text._tf_features）
│   └── src/
│       ├── lib.rs                # 模块入口 & batch_extract()
│       ├── lexical.rs            # 词汇特征（TTR、Yule's K、函数词）
│       ├── syntactic.rs          # 句法特征（句长统计）
│       ├── ngram.rs              # 字符 / 词 n-gram
│       └── unicode.rs            # CJK 比例、emoji、正式度
├── src/text/                     # Python 主包
│   ├── cli/                      # Typer CLI 入口
│   ├── ingest/                   # 数据摄取 & Pydantic Schema
│   ├── features/                 # NLP 特征提取 & SQLite 缓存
│   ├── llm/                      # LLM 后端抽象（LiteLLM）
│   ├── agents/                   # 多智能体分析
│   │   ├── stylometry.py         # 文体计量学 Agent + 共享 LLM 工具函数
│   │   ├── psycholinguistics.py
│   │   ├── sociolinguistics.py
│   │   ├── computational.py
│   │   ├── synthesis.py
│   │   └── orchestrator.py       # 并行调度器
│   ├── api/                      # FastAPI REST 服务
│   └── report/                   # 报告渲染（Rich / JSON / Markdown）
├── web/                          # Next.js 前端
├── tests/                        # pytest 测试集
│   └── fixtures/                 # 测试样本与黄金数据
├── sample/                       # 示例输入文件
├── backends.example.json         # LLM 后端配置模板
├── Cargo.toml                    # Rust workspace
└── pyproject.toml                # Python 项目配置
```