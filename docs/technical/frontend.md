# 前端与桌面端说明

## 总览

前端目录位于 `web/`，承担两类职责：

- 浏览器中的 Web 工作台
- 通过 Tauri 打包的桌面客户端

二者共享同一套前端页面和组件，但 API 来源不同：

- 浏览器开发模式默认走 `NEXT_PUBLIC_TEXT_API_ORIGIN`
- Tauri 运行时通过原生命令 `get_api_origin` 获取嵌入式 sidecar 地址

## Web 端结构

### 路由层

主要页面位于 `web/src/app/`：

- `app/page.tsx`: 首页转发到分析列表
- `app/analyses/page.tsx`: 分析历史列表
- `app/analyses/new/page.tsx`: 新建分析
- `app/analyses/detail/page.tsx`: 分析详情
- `app/analyses/features/page.tsx`: 特征视图
- `app/settings/page.tsx`: 设置入口
- `app/settings/backends/page.tsx`: 后端配置管理

### 组件层

通用组件与业务组件位于 `web/src/components/`，大致分为：

- `analysis/`: 上传与任务配置
- `progress/`: 进度面板、状态、日志流
- `report/`: 报告头部、综合面板、Agent 分区、导出
- `features/`: 图表与特征浏览
- `layout/`: 顶栏、主题、语言切换
- `ui/`: 基础 UI 组件

### 数据访问层

前端数据访问主要位于：

- `web/src/lib/api-client.ts`
- `web/src/lib/sse-client.ts`
- `web/src/hooks/use-analyses.ts`
- `web/src/hooks/use-analysis.ts`
- `web/src/hooks/use-sse-progress.ts`

这层负责：

- 封装 REST 请求
- 建立 SSE 连接
- 为页面提供可复用数据 hook

## 关键页面说明

### 分析列表

`web/src/app/analyses/page.tsx` 提供以下能力：

- 列表分页
- 按状态筛选
- 按任务类型筛选
- 按分析 ID 搜索
- 删除分析
- 取消运行中分析

它更像一个“分析任务管理台”，而不仅是结果列表。

### 新建分析

`web/src/app/analyses/new/page.tsx` 是主要创建入口，流程为：

1. 通过 `UploadZone` 上传并解析输入
2. 在 `ConfigForm` 中配置任务、后端与参数
3. 调用 API 创建分析
4. 跳转到详情页跟踪结果

### 详情与特征页

详情页负责展示：

- 当前状态
- 进度流
- 综合结论
- 各 Agent 分析结果
- 导出操作

特征页用于查看更底层的特征数据和对比图表。

## i18n 与状态管理

### 国际化

国际化由 `components/providers/i18n-provider.tsx` 提供，采用内联字典方式管理，而不是引入额外 i18n 框架。

### 状态管理

分析相关前端状态由 `web/src/stores/analysis-store.ts` 管理，用于支撑进度展示和详情联动。

## Tauri 桌面端

### 设计目标

桌面端的目标不是重新实现一套逻辑，而是在本地打包 Web 前端，并附带嵌入式 Python API sidecar，让最终用户无需手动启动后端服务。

### 关键实现

Tauri 入口在 `web/src-tauri/src/lib.rs`，主要负责：

- 查找可执行的后端二进制
- 选择可用端口
- 启动 sidecar 后端
- 轮询健康检查直到 `/api/v1/health` 可用
- 暴露 `get_api_origin`、`save_file`、`get_desktop_debug_snapshot`、`record_frontend_debug_events`、`open_main_webview_devtools`、`close_main_webview_devtools` 原生命令

桌面端现在会在 Tauri runtime 中把前端 `console.*`、`window.error` 与 `unhandledrejection` 转发到 Rust 层，并落盘到应用日志目录下的 `frontend-console.ndjson`。因此排查桌面端问题时，agent 可以直接读取本地日志文件，而不需要依赖额外的可视化调试页。

### 开发态与发布态差异

- 开发态会优先尝试仓库内或开发环境可执行的后端来源
- 发布态会从打包资源目录中解析 sidecar 二进制

因此，桌面端问题排查需要同时关注前端页面、Tauri 壳和 sidecar 后端三个层面。

## 前端边界

当前前端负责交互、可视化与任务管理，不负责：

- 真正的分析计算
- 规则阈值判断
- Agent 推理过程本身

这些逻辑都仍然位于 Python/Rust 后端。
