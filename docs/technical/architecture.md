# 总体架构

## 系统定位

`text` 是一个混合架构项目，核心由四层组成：

1. 输入与交互层
2. 分析服务层
3. 特征与推理层
4. 桌面交付层

它不是单纯的 Python 脚本工具，也不是只有前端页面的展示项目，而是一个同时覆盖 CLI、API、Web 和桌面壳的完整分析系统。

## 分层结构

### 1. 输入与交互层

主要入口：

- `src/text/cli/main.py`
- `web/src/app/*`

职责：

- 接收分析输入
- 配置任务类型与参数
- 发起分析请求
- 展示分析进度和结果

### 2. 分析服务层

主要入口：

- `src/text/api/app.py`
- `src/text/api/routers/*`
- `src/text/api/services/*`

职责：

- 提供 REST API
- 管理分析任务生命周期
- 维护后台 worker
- 持久化分析记录和进度事件

### 3. 特征与推理层

主要入口：

- `src/text/ingest/*`
- `src/text/features/*`
- `src/text/agents/*`
- `src/text/decision/*`
- `crates/tf-features/*`

职责：

- 统一输入数据模型
- 提取 Rust 与 Python 特征
- 并行运行多学科 Agent
- 进行综合决策和报告整合

### 4. 桌面交付层

主要入口：

- `web/src-tauri/src/lib.rs`
- `scripts/release/build_desktop_bundle.sh`

职责：

- 启动嵌入式后端 sidecar
- 向前端暴露本地 API origin
- 打包桌面安装产物

## 核心处理链路

```text
输入文件/上传数据
    -> ingest 解析为 AnalysisRequest
    -> features 提取 FeatureVector
    -> decision 生成确定性基础判断
    -> agents 并行生成学科报告
    -> synthesis 汇总为 ForensicReport
    -> API/CLI/Web 展示或导出
```

## 目录映射

### Python 主包

- `src/text/cli/`: CLI 入口
- `src/text/ingest/`: 输入加载与 Schema
- `src/text/features/`: 特征提取、缓存、嵌入、LIWC
- `src/text/agents/`: 学科 Agent 与调度器
- `src/text/decision/`: 阈值与确定性决策
- `src/text/report/`: 报告渲染
- `src/text/api/`: FastAPI、路由、服务

### Rust 扩展

- `crates/tf-features/src/lib.rs`: 扩展导出入口
- `crates/tf-features/src/lexical.rs`: 词汇特征
- `crates/tf-features/src/syntactic.rs`: 句法特征
- `crates/tf-features/src/ngram.rs`: n-gram 特征
- `crates/tf-features/src/unicode.rs`: Unicode/CJK/emoji/正式度特征

### Web 与桌面端

- `web/src/app/`: Next.js 路由
- `web/src/components/`: 页面组件与图表组件
- `web/src/hooks/`: 数据请求与 SSE hook
- `web/src/lib/`: API client、类型与工具
- `web/src/stores/`: 前端状态
- `web/src-tauri/`: Tauri 壳、sidecar 生命周期

## 关键设计原则

### 组合优先

系统通过“特征抽取 + 多 Agent + 综合汇总”的组合方式工作，而不是让单个模块承担所有推理职责。

### 优雅降级

多个关键环节允许在依赖不完整时继续运行，例如：

- Rust 特征模块不可用时跳过相关特征
- embedding 预热失败不阻塞 API 启动
- 单个 Agent 失败时返回失败摘要而不是中断整单分析

### 明确边界

目录结构基本按职责切分，便于后续扩展新任务类型、新 Agent 或新展示层，而不把逻辑都堆在一个入口文件里。
