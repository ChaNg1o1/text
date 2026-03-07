# 内部文档体系设计

## 背景

当前仓库已经具备较完整的实现，包括：

- Python CLI 分析入口
- FastAPI 后端服务与后台任务
- Rust 特征提取扩展
- Next.js Web 前端
- Tauri 桌面壳与内嵌后端 sidecar

但仓库缺少系统化 `docs/` 文档，已有说明主要分散在 `README.md`、`CLAUDE.md` 与代码结构中，不利于内部成员快速建立一致认知。

## 目标

建立一套面向内部研发、维护与交付的文档体系，满足以下目标：

- 帮助新成员快速理解产品定位与边界
- 帮助工程成员理解系统分层、链路和关键文件
- 帮助维护者完成本地运行、构建、部署与桌面交付
- 用当前实现校正文档与历史说明之间的偏差

## 读者

主要读者为内部团队：

- 后端开发
- 前端/桌面开发
- 技术负责人
- 交付与维护人员

## 设计方案

采用“产品 / 技术 / 开发交付”三层结构，而非单一长文档。

### 产品层

回答“这是什么、解决什么问题、有哪些能力、输入输出是什么”。

### 技术层

回答“系统如何组织、模块如何协作、关键实现在哪里、链路如何流转”。

### 开发交付层

回答“如何安装、运行、调试、构建、打包、交付”。

## 文档清单

- `docs/README.md`
- `docs/product/product-overview.md`
- `docs/product/requirements.md`
- `docs/technical/architecture.md`
- `docs/technical/backend.md`
- `docs/technical/frontend.md`
- `docs/technical/data-flow.md`
- `docs/development/setup.md`
- `docs/development/deployment.md`

## 编写原则

- 以当前代码为准，不沿用失效命令
- 优先描述模块职责与协作边界，不做逐文件流水账
- 对关键路径给出明确文件定位，便于开发者回溯源码
- 所有用户可见输出和文档内容统一使用简体中文
