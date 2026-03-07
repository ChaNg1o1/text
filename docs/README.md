# Text 文档中心

本文档面向项目内部成员，覆盖产品定位、技术架构、开发方式与部署交付。内容以当前仓库实现为准，优先解释系统如何工作、各模块之间如何协作，以及开发时应从哪里入手。

## 阅读顺序

1. 新成员先看 `docs/product/product-overview.md`
2. 需要理解整体实现时看 `docs/technical/architecture.md`
3. 需要定位后端实现时看 `docs/technical/backend.md`
4. 需要定位 Web/Tauri 时看 `docs/technical/frontend.md`
5. 需要梳理分析链路时看 `docs/technical/data-flow.md`
6. 需要本地运行和发布时看 `docs/development/setup.md` 与 `docs/development/deployment.md`

## 文档结构

### 产品文档

- `docs/product/product-overview.md`: 项目目标、目标用户、核心能力、使用场景
- `docs/product/requirements.md`: 功能需求、输入输出、非功能需求、约束

### 技术文档

- `docs/technical/architecture.md`: 系统分层、核心模块、目录映射
- `docs/technical/backend.md`: Python/Rust/API/Agent 后端实现说明
- `docs/technical/frontend.md`: Next.js Web 与 Tauri 桌面端说明
- `docs/technical/data-flow.md`: 从输入到报告的处理链路

### 开发与交付

- `docs/development/setup.md`: 环境准备、本地启动、常用命令
- `docs/development/deployment.md`: API 运行、桌面交付、配置管理

### 设计与计划

- `docs/plans/2026-03-06-docs-design.md`: 本次文档体系设计说明
- `docs/plans/2026-03-06-docs-implementation.md`: 本次文档落地计划

## 维护原则

- 文档应以代码现状为准，不复制已经失效的历史命令或接口
- 当 CLI、API 路由、前端页面、桌面打包方式变化时，同步更新对应文档
- 如无法确认实现细节，优先引用实际文件路径，例如 `src/text/api/app.py`、`web/src/app/analyses/new/page.tsx`
