# 后端实现说明

## 后端组成

本项目的“后端”并不只是 FastAPI 服务，还包括 CLI、数据模型、特征提取、决策逻辑和多智能体编排。

从实现上看，后端由以下部分组成：

- CLI 入口：`src/text/cli/main.py`
- 数据模型：`src/text/ingest/schema.py`
- 数据加载：`src/text/ingest/loader.py`
- 特征提取：`src/text/features/*`
- 决策逻辑：`src/text/decision/*`
- 智能体系统：`src/text/agents/*`
- API 服务：`src/text/api/*`
- 报告渲染：`src/text/report/renderer.py`

## CLI

CLI 入口位于 `src/text/cli/main.py`，由 `Typer` 构建。

### 当前主要命令

- `text analyze full`
- `text analyze verify`
- `text analyze closed-set-id`
- `text analyze open-set-id`
- `text analyze cluster`
- `text analyze profile`
- `text analyze sockpuppet`
- `text extract`
- `text evaluate`
- `text config info`
- `text config backends`
- `text config cache status`
- `text config cache clear`

CLI 的职责不是做业务实现本身，而是：

- 解析命令参数
- 加载输入
- 调用特征抽取与分析管线
- 将结果输出为终端视图或文件

## 数据模型

统一数据模型位于 `src/text/ingest/schema.py`，是整个系统的契约层。

### 核心对象

- `TextEntry`: 单条文本
- `AnalysisRequest`: 分析请求
- `TaskParams`: 任务参数
- `FeatureVector`: 特征向量
- `AgentReport`: 单 Agent 报告
- `ForensicReport`: 最终取证报告

### 任务枚举

当前任务类型由 `TaskType` 定义：

- `verification`
- `closed_set_id`
- `open_set_id`
- `clustering`
- `profiling`
- `sockpuppet`
- `full`

### 设计价值

这一层保证 CLI、API、前端、worker、Agent 都围绕同一份数据结构工作，避免多套格式并行演化。

## 特征提取

特征提取由 Python 编排、Rust 加速。

### Rust 层

Rust 扩展通过 `PyO3` 暴露为 `text._tf_features`，重点负责高吞吐和可并行的统计特征，例如：

- token / type 指标
- 句长统计
- 字符与词级 n-gram
- 标点特征
- CJK、emoji、正式度等 Unicode 相关特征

### Python 层

Python 层负责：

- 缓存管理 `features/cache.py`
- 批量抽取编排 `features/extractor.py`
- embedding `features/embeddings.py`
- LIWC `features/liwc.py`

两层最终统一产出 `FeatureVector`。

## 确定性决策与多智能体

### 决策层

`src/text/decision/*` 负责确定性判断与阈值逻辑。其作用是先生成一层不依赖 LLM 的基础结果，降低完全依赖语言模型的风险。

### Orchestrator

`src/text/agents/orchestrator.py` 是核心调度器，主要流程如下：

1. 读取后端配置并构造 Agent
2. 基于请求构建任务上下文
3. 调用 `DecisionEngine` 生成基础报告
4. 并行运行多个学科 Agent
5. 交给 `SynthesisAgent` 汇总最终报告

### Agent 角色

- `StylometryAgent`: 文体计量视角
- `WritingProcessAgent`: 写作过程与心理语言学视角
- `ComputationalAgent`: 数值与聚类视角
- `SociolinguisticsAgent`: 社会语言学视角
- `SynthesisAgent`: 综合收敛与置信度整合

### 故障处理

调度器中的 `_run_agent()` 对单 Agent 异常做兜底：失败会记录为一个失败的 `AgentReport`，而不是直接让整次分析崩溃。

## API 服务

### 应用入口

FastAPI 工厂位于 `src/text/api/app.py`，通过 `create_app()` 创建应用。

### 生命周期职责

在 `lifespan` 中会初始化：

- `AnalysisStore`
- `ObservabilityRegistry`
- `AnalysisWorker`
- `progress_manager` 持久化回调
- embedding 预热

### 路由层

当前应用会注册以下路由模块：

- `analyses`
- `backends`
- `features`
- `observability`
- `qa`
- `settings`
- `uploads`
- `progress`（可选导入）

此外还有健康检查接口 `/api/v1/health`。

### 服务层

`src/text/api/services/*` 负责：

- 分析记录持久化
- 后台任务执行
- 进度事件广播与持久化
- 后端配置存储
- 可观测性

这意味着 API 层不是薄壳，它承担了真正的任务调度、队列处理和状态管理职责。

## 报告输出

报告渲染位于 `src/text/report/renderer.py`，主要支持：

- Rich 终端渲染
- Markdown
- JSON

这使同一份分析结果可以被 CLI、API 和前端以不同形式消费。
