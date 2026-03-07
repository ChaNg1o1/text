# 数据流与分析链路

## 概览

系统有两条主要入口链路：

- CLI 直连分析链路
- Web/Tauri 通过 API 的异步分析链路

两条链路最终都会落到同一套数据模型、特征提取和 Agent 编排逻辑上。

## 链路一：CLI

### 1. 输入加载

CLI 通过 `src/text/cli/main.py` 调用 `_load_data()`，再由 `load_from_path()` 将文件或目录解析为 `AnalysisRequest`。

### 2. 特征提取

`_extract_features()` 会初始化 `FeatureExtractor`，并在允许时启用 `FeatureCache`。

输出为：

- `FeatureVector[]`

### 3. 运行分析

`_run_analysis()` 会：

1. 调用特征提取
2. 构造 `OrchestratorAgent`
3. 执行 `orchestrator.analyze()`
4. 得到 `ForensicReport`

### 4. 结果输出

CLI 最终调用 `_emit_report()`，输出为：

- 终端 Rich
- Markdown 文件
- JSON 文件

## 链路二：API / Web / Tauri

### 1. 前端提交

前端在 `web/src/app/analyses/new/page.tsx` 中：

1. 上传文件并解析为结构化对象
2. 组合 `texts`、`artifacts`、`activity_events`、`interaction_edges`
3. 选择任务类型和参数
4. 调用创建分析接口

### 2. API 接收

FastAPI 应用由 `src/text/api/app.py` 启动，并将请求交给对应路由与服务层处理。

### 3. 持久化与排队

分析请求会先进入 `AnalysisStore` 持久化，再由 `AnalysisWorker` 负责后台执行。

这样做的目的包括：

- 支持前端异步轮询或实时订阅
- 在任务执行期间保留状态
- 支持列表页历史管理

### 4. 进度广播

系统通过 `progress_manager` 广播进度事件，并可将事件持久化到存储层。

前端再通过 `EventSource` 和 `useSSEProgress` 消费这些事件。

### 5. 后台分析

后台分析的核心仍然是：

1. 解析后的 `AnalysisRequest`
2. 特征提取
3. `DecisionEngine`
4. 多 Agent 并行分析
5. `SynthesisAgent`
6. 生成 `ForensicReport`

### 6. 结果查询与展示

当分析完成后：

- 列表页读取状态与概要字段
- 详情页读取完整报告
- 特征页读取底层特征数据
- 导出组件按需要生成文件

## Agent 内部流转

在 `OrchestratorAgent.analyze()` 中，核心顺序是：

1. 构建任务上下文字符串
2. 由 `DecisionEngine` 生成确定性基础报告
3. 对多个 discipline agent 使用 `asyncio.gather()` 并行执行
4. 将基础报告和 agent 报告交给 `SynthesisAgent`

这意味着系统的最终结论来自“基础判断 + 多学科解释 + 综合收敛”的三层叠加。

## 缓存流

特征缓存位于 `features/cache.py`，用于减少重复文本的重复抽取成本。

缓存的价值主要体现在：

- 重复运行同一数据集时减少时延
- 前后端共用相同特征抽取逻辑时避免重复计算

## 桌面端数据流

Tauri 运行时的数据流如下：

1. 桌面应用启动
2. Rust 壳启动嵌入式 API sidecar
3. 前端通过 `get_api_origin` 获取本地 API 地址
4. 之后的数据交互与浏览器版前端一致

因此，桌面端本质上是“本地化部署的 Web + API 组合”，而不是完全不同的一套系统。
