# Frontend 视觉回归启动方案

本文档描述 `web/` 第一版视觉回归的落地方案，目标是在不依赖真实后端的前提下，为 Tauri 桌面应用的关键页面建立稳定、可更新、可复跑的截图基线，并为后续去重设计、提升用户体验与信息密度提供回归护栏。

## 目标

- 为高频页面建立首批视觉基线，覆盖后续 UI 重构中的主要风险面。
- 让视觉回归结果与 `docs/technical/frontend-quality-audit.md` 中的核心问题形成对应关系。
- 避免把后端状态、时间漂移、欢迎页视频和动效波动混入截图结果。
- 让桌面端页面在重构后持续朝“更少重复设计、更高信息密度、更清晰阅读路径”的方向收敛。

## 为什么选择 Playwright + Route Mocking

### 使用 Playwright 的原因

- 当前仓库是 Next.js 前端，关键页面均为浏览器渲染，适合直接通过真实 DOM 生成基线。
- Playwright 支持稳定截图、固定视口、禁用动画、模拟 locale 和媒体特征，适合做视觉 smoke。
- 当前目标是桌面端 Tauri 应用，因此只维护单一桌面基线，不把测试复杂度浪费在无关矩阵上。

### 使用浏览器侧 route mocking 的原因

- 当前前端默认依赖 `http://127.0.0.1:8000/api/v1`，没有内建 mock 模式。
- 若直接依赖真实后端，会引入数据初始化、LLM/特征接口状态、时间差和本地环境不一致的问题。
- route mocking 可以直接在浏览器层截获 `/api/v1/*` 请求，使用固定 fixtures 保证截图稳定，不改业务运行时代码。

## 首批覆盖范围

第一版只做关键页面烟测，不做全量矩阵。

### 页面范围

- `/analyses`
- `/analyses/new`
- `/settings`
- `/settings/backends`
- `/analyses/detail?id=visual-smoke`
- `/analyses/features?id=visual-smoke`

### 不纳入第一版的内容

- `/` 的独立视觉基线
  - 只验证它会落到主分析入口，不单独保存截图
- dark mode
- 英文 locale
- 移动端矩阵
- Tauri 桌面壳层
- PDF/export 相关交互
- 运行中 SSE 实时态

说明：

- 当前项目的主要运行形态是桌面端 Tauri 应用，因此第一版视觉回归只服务桌面信息工作流。
- 不规划移动端基线，除非产品形态发生变化。

## 固定环境约束

为了避免截图抖动，回归环境必须固定：

- 浏览器：Chromium
- 视口：单一桌面尺寸
- locale：`zh`
- color scheme：`light`
- reduced motion：开启
- welcome screen：默认跳过
- 时间：冻结 `Date.now()`，避免相对时间文案漂移

## Fixture 设计原则

### 设计目标

- fixture 只负责“稳定渲染页面”，不追求完全模拟后端实现细节。
- 数据结构必须贴合 `web/src/lib/types.ts` 中实际页面使用到的字段。
- 同一页面相关接口优先共用同一份语义数据，避免碎片化。

### 建议命名

- `analysis-list`
- `analysis-detail`
- `analysis-features`
- `settings`
- `backends`

### 建议覆盖的接口

- analyses list
- analysis detail
- features
- settings
- backends
- custom backends
- progress snapshot
- QA suggestions

说明：

- detail 页面包含 `ReportQaPanel`，即使不触发真正问答，也应给 suggestions 提供稳定响应。
- detail 页面选用“已完成报告态”，这样不会进入 SSE 实时连接分支。

## 页面级基线策略

### `/analyses`

- 目标：覆盖首屏壳层、筛选区和历史表格。
- 基线要求：
  - 至少有 1 条 completed、1 条 running、1 条 failed 数据。
  - 保证摘要卡、状态 badge、表格列都可见。

### `/analyses/new`

- 目标：覆盖首屏引导、上传区和配置表单首屏布局。
- 基线要求：
  - 页面加载时需要能看到上传区与配置区，但不触发真实上传。
  - settings/backends 接口应返回稳定默认值。

### `/settings`

- 目标：覆盖首屏摘要卡、tab 和通用设置表单。
- 基线要求：
  - 至少包含 1 个 ready backend。
  - prompt override 里保留少量非空字段，确保表单密度真实。

### `/settings/backends`

- 目标：覆盖左侧 backend 列表 + 右侧编辑面板的双栏布局。
- 基线要求：
  - 至少提供 2 组自定义 backend。
  - 其中至少 1 组为 ready，1 组为 missing key。

### `/analyses/detail?id=visual-smoke`

- 目标：覆盖报告主阅读面。
- 基线要求：
  - 使用 completed 报告数据。
  - 至少包含 narrative、conclusion、evidence、cluster、writing profile、limitations 等基础模块。
  - 不测试运行中进度条和 SSE。

### `/analyses/features?id=visual-smoke`

- 目标：覆盖特征图表工作台。
- 基线要求：
  - features 数据量要足够支撑热力图、分布图和比较视图。
  - 至少 2 个作者分组，且每组有多个样本。

## 基线生成与更新流程

### 初始化

1. 安装 Playwright 依赖。
2. 在 `web/` 中加入 Playwright 配置与视觉 smoke 用例。
3. 生成初始截图基线。

### 日常更新

当设计或布局有意变化时：

1. 先阅读 `docs/technical/frontend-quality-audit.md`，确认变更是否触及既有风险点。
2. 执行视觉回归。
3. 若差异为预期结果，再更新截图基线。
4. 在 PR 中附上关键截图差异说明。

### 不应更新基线的场景

- 仅因时间漂移、欢迎页、动画或异步加载导致的偶发差异
- 未经确认的颜色偏移
- 报告页中中英混排或 badge 样式再次分叉

## 失败排查流程

当视觉回归失败时，按以下顺序排查：

1. **先看环境稳定性**
  - 是否正确跳过欢迎页
  - 是否冻结了时间
  - 是否启用了 reduced motion
2. **再看 mock 响应**
  - 是否有接口漏拦截
  - 是否出现 fixture 字段缺失导致 fallback UI
3. **最后看真实 UI 变化**
  - 是否是页面布局调整
  - 是否是 token、状态 badge、标题层级等视觉系统变化

如果失败来自真实 UI 变化，应优先更新文档，再更新基线。

## 维护约束

- fixture 必须以页面语义命名，不按单个接口碎片化命名。
- 视觉 smoke 只保留关键页面，不在第一版追求覆盖所有分支。
- 每新增一类高风险视觉模块时，先决定它是否属于：
  - 主路径页面
  - 复杂报告模块
  - 二期矩阵扩展
- 任何新增视觉基线都应能回答两个问题：
  - 它在防什么回归？
  - 它是否对应当前审计中的某个高优先级问题？

## 与当前审计结果的对应关系

第一版视觉回归主要用于盯住以下风险：

- 页面首屏壳层和摘要卡重复重构时的无意识漂移
- 报告区与主应用区视觉语言继续分叉
- 状态 badge、eyebrow 和标题层级再次不统一
- 报告页在整理 confidence / evidence / cluster 模块时发生布局退化
- settings/backends 双栏结构在后续整理中丢失稳定性

## 后续扩展方向

第一版稳定后，后续扩展仍然以桌面端为中心：

- 复杂报告子模块的局部截图
- 更细粒度的组件级视觉基线
- 面向信息密度优化的局部区域对比基线
- dark mode 或英文 locale 的补充基线
