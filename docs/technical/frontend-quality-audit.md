# Frontend 质量审计

本文档记录 `web/` 当前前端实现的静态质量审计结果，重点覆盖重复设计、视觉系统一致性、可访问性、响应式、主题化与维护成本。结论基于 2026-03-08 仓库现状，供后续面向 Tauri 桌面端的重构、规范化和视觉回归使用。审计目标不是追求页面“更满”，而是减少重复表达，在有限桌面空间内提升阅读效率、操作清晰度与信息密度。

## Anti-Patterns Verdict

结论：`Fail`

当前界面存在较明显的模板化与重复设计信号，主要体现在：

- 页面首屏反复使用相同的玻璃卡片壳层、同一组阴影、同类圆角与同类摘要卡布局。
- 报告区使用了一套独立于主应用的深色高饱和视觉语言，像是第二个产品嵌在当前产品里。
- 同一种 11px 全大写 eyebrow 文案被过度复用，已经从“层级提示”退化为“装饰性语气”。
- 存在多套结论置信度展示语法，信息层级重复。
- 主体中文界面中穿插英文标签与英文 section 名称，削弱整体感。

## Executive Summary

- 严重级别分布：`0 Critical / 3 High / 3 Medium / 1 Low`
- 最需要优先处理的问题：
  - 页面首屏壳层与摘要卡的重复实现
  - 报告区与主应用区的双视觉系统分叉
  - 置信度模块重复实现与信息层级冲突
  - 顶部导航与工具栏的触控尺寸偏小
- 当前整体质量评分：`61/100`
- 推荐下一步：
  - 先收敛设计系统与重复组件，再用桌面端视觉回归守住基线，最后做针对性修复

## Detailed Findings by Severity

### High

#### 1. 页面壳层和摘要卡被复制成固定模板

- Location:
  - `web/src/app/analyses/page.tsx`
  - `web/src/app/analyses/new/page.tsx`
  - `web/src/app/settings/page.tsx`
  - `web/src/app/settings/backends/page.tsx`
  - `web/src/components/analysis/upload-zone.tsx`
- Severity: High
- Category: Theming / Anti-pattern
- Description:
  - 多个入口页面直接复制 `rounded-[24px] + border + bg-card + shadow + backdrop-blur` 的壳层组合，并重复手写 3 列或 4 列摘要卡。
  - 这些首屏结构已经不是“复用设计语言”，而是“复制样式片段”。
- Impact:
  - 后续任何视觉调整都需要多点同步。
  - 首屏之间缺乏角色差异，页面容易显得模板化。
  - 设计系统无法沉淀为真正的共享 primitive。
- WCAG/Standard:
  - 不直接违反 WCAG，但违反设计系统一致性与低冗余原则。
- Recommendation:
  - 抽离 `PageIntro`、`StatStrip`、`SurfaceCard` 这类共享构件。
  - 将视觉差异放在数据与布局语义上，不要靠复制 class 组合实现。
- Suggested command:
  - `/extract`
  - `/normalize`

#### 2. 报告区和主应用区已经形成双视觉系统

- Location:
  - `web/src/components/report/report-hero.tsx`
  - `web/src/components/report/cluster-landscape.tsx`
  - `web/src/components/report/confidence-rail.tsx`
  - `web/src/components/report/evidence-atlas.tsx`
  - `web/src/app/globals.css`
- Severity: High
- Category: Theming
- Description:
  - 主应用使用 token 化的浅色卡片体系；报告区则大量使用独立硬编码颜色、深色面板、英文标签和更高饱和的强调色。
  - 这不是“重要内容的强调”，而是视觉语法的分叉。
- Impact:
  - 主题切换体验不统一。
  - 用户在页面切换时会感到像进入另一套产品。
  - 后续维护会持续出现 token 外溢和例外逻辑。
- WCAG/Standard:
  - 主题系统一致性问题；部分硬编码颜色还会放大暗色模式维护风险。
- Recommendation:
  - 报告区改为基于现有全局 token 派生，只允许局部 accent 偏离，不允许自建整套配色。
  - 所有 section title 和 badge 统一走 i18n 文案层。
- Suggested command:
  - `/normalize`
  - `/clarify`

#### 3. 置信度视图存在重复实现与层级冲突

- Location:
  - `web/src/components/report/confidence-overview.tsx`
  - `web/src/components/report/confidence-rail.tsx`
  - `web/src/components/report/report-hero.tsx`
- Severity: High
- Category: Performance / Anti-pattern
- Description:
  - `ConfidenceOverview` 与 `ConfidenceRail` 都在表达“结论 + 百分比 + 进度条 + badge”。
  - `ReportHero` 自己又提供一套概览式统计块。
  - 当前仓库里 `ConfidenceOverview` 看起来已经是孤立实现，但仍保留在代码中。
- Impact:
  - 用户会看到多种相近但不一致的“主结论语法”。
  - 开发上增加理解成本和未来分叉概率。
  - 未使用或低使用的近重复组件会拖累维护。
- WCAG/Standard:
  - 不直接属于 WCAG，但属于信息架构与组件冗余问题。
- Recommendation:
  - 明确只保留一种主置信度可视化。
  - 删除未接入或被替代的重复组件。
  - `ReportHero` 只负责 framing，不再承担重复的置信度表达。
- Suggested command:
  - `/distill`
  - `/extract`

### Medium

#### 4. 顶部导航与详情工具栏触控尺寸偏小

- Location:
  - `web/src/components/ui/button.tsx`
  - `web/src/components/layout/header.tsx`
  - `web/src/components/layout/language-toggle.tsx`
  - `web/src/components/layout/theme-toggle.tsx`
  - `web/src/app/analyses/detail/page.tsx`
- Severity: Medium
- Category: Responsive / Accessibility
- Description:
  - `Button` 的 `sm` 和 `icon-sm` 规格为 32px 高，导航项、语言切换、主题切换和详情页小图标按钮都在使用这套尺寸。
- Impact:
  - 触控场景下误触率上升。
  - 顶部高频操作区在移动设备上可用性下降。
- WCAG/Standard:
  - 不满足常见移动 HIG 的推荐值；接近 WCAG 2.5.5 Target Size 的风险区。
- Recommendation:
  - 将导航和主工具栏高频按钮提升到 40px 或 44px 级别。
  - 对桌面与移动使用不同尺寸 token。
- Suggested command:
  - `/adapt`
  - `/harden`

#### 5. 证据链区域依赖横向滚动，不是真正响应式

- Location:
  - `web/src/components/report/forensic-scroll.tsx`
- Severity: Medium
- Category: Responsive
- Description:
  - `evidence-chain` 区块使用 `min-w-[760px]` 加动态列网格，移动端只能依赖横向滚动查看。
- Impact:
  - 用户需要在二维表格中来回平移，阅读成本高。
  - 关键证据关系在窄视口下不容易建立整体感。
- WCAG/Standard:
  - 不属于硬性 WCAG 失败，但不符合组件级响应式适配原则。
- Recommendation:
  - 为移动端单独设计 stack/list 模式。
  - 桌面端保留矩阵，移动端切换为分段卡片或 accordion。
- Suggested command:
  - `/adapt`

#### 6. 状态色和 eyebrow 样式已经出现系统性漂移

- Location:
  - `web/src/app/analyses/page.tsx`
  - `web/src/components/report/report-header.tsx`
  - `web/src/components/report/narrative-spine.tsx`
  - `web/src/components/report/cluster-landscape.tsx`
  - `web/src/app/settings/page.tsx`
- Severity: Medium
- Category: Theming
- Description:
  - `pending/running/completed/failed` 在不同位置有不同色值映射。
  - eyebrow 使用同类字号和 tracking，但并未抽成共享语义组件。
- Impact:
  - 用户对状态与层级的心智模型不稳定。
  - 设计 token 难以统一，视觉细节会继续漂移。
- WCAG/Standard:
  - 设计系统一致性问题。
- Recommendation:
  - 抽离共享状态色映射和 `SectionEyebrow` primitive。
  - 仅在真正需要分区提示的地方使用 eyebrow。
- Suggested command:
  - `/normalize`
  - `/extract`

### Low

#### 7. 视觉背景与装饰性动效略重，默认语气偏“样式先行”

- Location:
  - `web/src/app/globals.css`
  - `web/src/components/welcome/welcome-screen.tsx`
- Severity: Low
- Category: Performance / Anti-pattern
- Description:
  - 全局 surface flow、欢迎视频和多处装饰性 motion 让工具型应用默认语气偏“展示感”。
- Impact:
  - 首次进入成本偏高。
  - 当主流程是分析与阅读时，装饰性动效会与信息密度争抢注意力。
- WCAG/Standard:
  - 当前已有 reduced-motion 兜底，不构成直接可访问性失败。
- Recommendation:
  - 保留 reduced-motion 的基础上，重新评估哪些动效对任务完成有帮助，哪些只是风格铺陈。
- Suggested command:
  - `/quieter`
  - `/distill`

## Patterns & Systemic Issues

- 同一种页面首屏壳层至少重复出现在 5 个位置。
- 相同摘要卡 strip 至少出现在分析列表、新建分析、设置、后端设置和上传后预览等场景。
- 报告区内部混用中文主内容与英文 section 标题，说明文案系统没有统一入口。
- 状态 badge、置信度条和 eyebrow 都没有完成系统级抽象，只是在不同文件里“长得像”。
- `web/src/components/report/` 下有多组“近重复概览组件”，说明当前报告信息架构仍在并行试验状态。

## Positive Findings

- 全局 token 基础已经具备，`web/src/app/globals.css` 中的 OKLCH、light/dark 变量和 radius 层级是良好起点。
- 已有 reduced-motion 处理，说明实现时考虑了动态干扰问题。
- `web/src/app/layout.tsx` 中提供了跳转到主内容的 skip link。
- 多数组件已经使用 shadcn/Radix 语义基础构件，可作为后续收敛的稳定底盘。

## Recommendations by Priority

### Immediate

- 收敛报告区的视觉系统，不再让其独立于主应用配色和文案体系。
- 删除或合并重复的置信度模块，明确唯一的结论展示主路径。
- 以桌面端阅读与分析路径为中心建立视觉回归基线，避免在重构首屏与报告区时出现无意识退化。
- 优先删除装饰性重复块，把空间让给更高价值的信息与操作。

### Short-term

- 抽离页面首屏壳层与摘要卡 primitive。
- 统一状态 badge 配色映射。
- 统一 eyebrow 的语义、使用条件与尺寸。

### Medium-term

- 提升顶部导航和详情工具栏按钮的触控面积。
- 系统化清理中英混排标签与硬编码颜色。
- 重排报告区模块顺序与密度，让关键结论、证据和下一步动作在桌面首屏更集中。

### Long-term

- 重新评估欢迎视频和全局背景动效在工具型产品中的必要性。
- 将报告组件与常规页面组件纳入统一的设计语言和 token 治理流程。

## Suggested Commands for Fixes

- `/extract`
  - 适合抽离首屏壳层、摘要卡、状态 badge 和 eyebrow 等重复构件。
- `/normalize`
  - 适合统一报告区与主应用区的 token、颜色、边框与阴影语法。
- `/distill`
  - 适合删除重复的 confidence 展示和冗余首屏装饰。
- `/adapt`
  - 适合解决 evidence-chain 的移动端适配和小触控目标问题。
- `/clarify`
  - 适合统一中英混排文案、section 标签和微文案风格。
- `/quieter`
  - 适合降低欢迎页和全局背景动效的装饰性强度。
