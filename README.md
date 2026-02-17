# Text Forensics

🔍 基于多智能体协作的数字取证文本分析系统，结合 Rust 高性能特征提取与 LLM 多智能体推理

## 📖 项目概述

**Text Forensics Platform** 是一个面向数字取证场景的文本分析系统，通过传统计算语言学特征工程与大语言模型推理的深度融合，为作者身份鉴定提供高置信度的分析报告。系统内置四个专业语言学智能体并行分析，最终由综合智能体交叉验证、整合结论。

### 核心能力

- **作者归属分析（Attribution）** — 判定文本是否由同一作者撰写，识别独特的写作指纹
- **作者画像（Profiling）** — 构建语言学画像，推断人口统计特征、心理特质与社会背景
- **傀儡账号检测（Sockpuppet Detection）** — 检测多个账号是否由同一自然人运营
- **综合取证分析（Full Analysis）** — 整合所有分析能力的全面取证报告

## 🛠️ 技术栈

**Rust 高性能层**

| 组件 | 说明 | 版本 |
| --- | --- | --- |
| **PyO3** | Rust-Python 绑定 | 0.24 |
| **Rayon** | 并行特征提取 | 1.10 |
| **unicode-segmentation** | Unicode 文本分割 | 1.12 |
| **regex** | 正则表达式引擎 | 1 |
| **rustc-hash** | 高性能哈希 | 2 |
| **serde** | 序列化/反序列化 | 1 |

**Python 分析层**

| 组件 | 说明 | 版本 |
| --- | --- | --- |
| **Typer** | CLI 框架 | >= 0.15 |
| **Rich** | 终端美化与进度显示 | >= 13 |
| **Pydantic** | 数据模型验证 | >= 2 |
| **LiteLLM** | 统一 LLM API 接口 | >= 1.60 |
| **spaCy** | NLP 管道（POS / 依存分析） | >= 3.8 |
| **sentence-transformers** | 语义嵌入向量 | >= 3 |
| **scikit-learn** | 聚类与相似度计算 | >= 1.6 |
| **NumPy** | 数值运算 | >= 2 |
| **aiosqlite** | 异步特征缓存 | >= 0.21 |

## 🏗️ 系统架构

```
输入文本 → 数据摄取 → 特征提取(Rust + Python NLP) → 多智能体并行分析 → 综合报告
                          │                              │
                     SQLite 缓存                    asyncio.gather()
                                                         │
                                          ┌──────────────┼──────────────┐
                                          │              │              │
                                     文体计量学     心理语言学     社会语言学
                                          │              │              │
                                          └──────────────┼──────────────┘
                                                    计算语言学
                                                         │
                                                    综合 Agent
                                               (交叉验证 + 置信度校准)
                                                         │
                                                    取证报告
```

### 多智能体分工

| Agent | 学科领域 | 分析维度 |
| --- | --- | --- |
| **Stylometry** | 文体计量学 | 句长分布、TTR、Yule's K、标点模式、n-gram 指纹 |
| **Psycholinguistics** | 心理语言学 | LIWC 维度、Big Five 推断、情感效价、认知复杂度 |
| **Sociolinguistics** | 社会语言学 | 正式度、代码转换、社交风格、地域标记、emoji 模式 |
| **Computational** | 计算语言学 | 余弦相似度矩阵、DBSCAN 聚类、z-score 异常检测 |
| **Synthesis** | 跨学科综合 | 交叉验证、矛盾识别、置信度计算、行动建议 |

## 🚀 快速开始

### 前置依赖

- Python >= 3.11
- Rust 工具链（用于编译特征提取模块）
- 至少一个可用的 LLM 后端

### 安装

```bash
# 克隆项目
git clone https://github.com/ChaNg1o1/text.git
cd text

# 安装 Python 依赖
pip install -e ".[dev]"

# 编译 Rust 扩展
maturin develop

# 下载 spaCy 语言模型
python -m spacy download en_core_web_sm
```

### 配置 LLM 后端

复制并编辑后端配置文件：

```bash
cp backends.example.json backends.json
```

`backends.json` 支持多种 OpenAI / Anthropic 兼容的 API 端点：

```json
{
  "backends": {
    "deepseek": {
      "provider": "openai_compatible",
      "model": "deepseek-chat",
      "api_base": "https://api.deepseek.com/v1",
      "api_key_env": "DEEPSEEK_API_KEY"
    }
}
}
```

也可直接在配置中使用 `"api_key"` 字段内联密钥。

### 运行分析

```bash
# 综合取证分析
text analyze input.txt --task full --llm siliconflow

# 作者归属分析
text analyze texts.csv --task attribution --llm claude

# 傀儡账号检测
text analyze posts.jsonl --task sockpuppet --suspects "user_a,user_b" --llm deepseek

# 仅导出特征向量（不调用 LLM）
text features input.txt --output features.json

# 查看系统状态与可用后端
text info
```

### 输入格式

支持 CSV、JSON、JSONL、TXT 四种格式。CSV/JSON/JSONL 需包含 `author` 和 `content` 字段。

## 🪗 环境变量说明

```bash
# LLM API Keys（根据使用的后端配置对应变量）
ANTHROPIC_API_KEY=sk-xxx          # Anthropic Claude
OPENAI_API_KEY=sk-xxx             # OpenAI GPT
DEEPSEEK_API_KEY=sk-xxx           # DeepSeek
SILICONFLOW_API_KEY=sk-xxx        # SiliconFlow

# 可选：也可在 backends.json 中直接配置 api_key
```

## 📂 项目结构

```
text/
├── crates/tf-features/       # Rust 特征提取模块（PyO3 → text._tf_features）
│   └── src/
│       ├── lib.rs             # 模块入口 & batch_extract()
│       ├── lexical.rs         # 词汇特征（TTR, Yule's K, 函数词）
│       ├── syntactic.rs       # 句法特征（句长统计）
│       ├── ngram.rs           # 字符/词 n-gram
│       └── unicode.rs         # CJK 比例、emoji、正式度
├── src/text/                  # Python 主包
│   ├── cli/                   # Typer CLI
│   ├── ingest/                # 数据摄取 & Pydantic Schema
│   ├── features/              # NLP 特征提取 & 缓存
│   ├── llm/                   # LLM 后端抽象（LiteLLM）
│   ├── agents/                # 多智能体分析
│   └── report/                # 报告渲染
├── backends.example.json      # LLM 后端配置模板
├── Cargo.toml                 # Rust workspace
└── pyproject.toml             # Python 项目配置
```
