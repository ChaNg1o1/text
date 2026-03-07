# Documentation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `text` 项目补齐一套面向内部成员的产品、技术与开发交付文档，并统一收敛到 `docs/` 目录。

**Architecture:** 文档按产品、技术、开发交付三层拆分，入口文件负责导航；每份文档以当前代码实现为依据，重点覆盖模块边界、处理链路与运行方式。计划中优先产出目录骨架，再补齐产品、技术和运行部署说明。

**Tech Stack:** Markdown、Python CLI、FastAPI、Rust PyO3、Next.js、Tauri

---

### Task 1: 建立文档目录骨架

**Files:**
- Create: `docs/README.md`
- Create: `docs/plans/2026-03-06-docs-design.md`
- Create: `docs/plans/2026-03-06-docs-implementation.md`

**Step 1: 确认文档层级**

写出三层结构：

- 产品
- 技术
- 开发交付

**Step 2: 创建入口文档**

在 `docs/README.md` 中补充阅读顺序、目录导航和维护原则。

**Step 3: 创建设计文档**

在 `docs/plans/2026-03-06-docs-design.md` 中写明读者、目标与文档清单。

**Step 4: 自查**

确认 `docs/README.md` 中的每个链接都对应实际文件路径。

### Task 2: 编写产品文档

**Files:**
- Create: `docs/product/product-overview.md`
- Create: `docs/product/requirements.md`

**Step 1: 写产品概览**

覆盖项目定位、目标用户、核心能力、典型场景与输出形态。

**Step 2: 写需求说明**

覆盖任务类型、输入数据、输出结果、后台管理能力与非功能需求。

**Step 3: 与代码对齐**

确保任务类型与 `src/text/ingest/schema.py`、`src/text/cli/main.py` 保持一致。

### Task 3: 编写技术文档

**Files:**
- Create: `docs/technical/architecture.md`
- Create: `docs/technical/backend.md`
- Create: `docs/technical/frontend.md`
- Create: `docs/technical/data-flow.md`

**Step 1: 写总体架构**

描述系统分层、目录映射与关键职责边界。

**Step 2: 写后端实现**

覆盖 CLI、数据模型、特征提取、Agent、API 服务与后台任务。

**Step 3: 写前端实现**

覆盖分析列表、新建分析、详情展示、SSE 进度、Tauri sidecar。

**Step 4: 写链路文档**

串联输入、上传、排队、特征提取、Agent 推理、报告落库与查询展示。

### Task 4: 编写开发与交付文档

**Files:**
- Create: `docs/development/setup.md`
- Create: `docs/development/deployment.md`

**Step 1: 写本地开发文档**

覆盖依赖安装、本地运行、测试命令与常见入口。

**Step 2: 写部署与交付文档**

覆盖 API 运行方式、配置项、桌面打包和交付产物。

**Step 3: 修正历史偏差**

避免写入与当前仓库不一致的旧命令。

### Task 5: 验证与整理

**Files:**
- Modify: `docs/**/*.md`

**Step 1: 全量自查**

检查目录、命名、链接与命令是否一致。

**Step 2: 运行静态检查**

如 IDE 有 Markdown 诊断，修正文档级问题。

**Step 3: 完成说明**

总结新增文档范围、未覆盖内容与后续维护建议。
