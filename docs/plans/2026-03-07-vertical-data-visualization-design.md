# Vertical Data Visualization Design — Scroll + Linked Lenses

**Date:** 2026-03-07
**Status:** Approved

## 概述

对 Text Forensics Platform 的全部 7 个分析垂直维度（Conclusion、Evidence、Writing Profile、Cluster、Narrative、Anomaly、Feature）进行系统性可视化重构。采用 **Scroll + Linked Lenses（卷轴 + 透镜）** 方案，以叙事卷轴为主体，透镜机制按需叠加不同维度数据层。

## 设计原则

- **易用为主**：零学习成本，默认打开即可读懂
- **hover 即预览，click 即钻取**：统一两层交互模式
- **透镜默认关闭**：只有主动开启才叠加额外数据层
- **面包屑式回退**：钻取后一键回到上层
- **无渐变**：纯色扁平风格，离散色阶

## 色彩系统

每个垂直维度分配固定语义色，全局统一：

| 维度 | 色值 | Tailwind |
|------|------|----------|
| Conclusion 结论 | `#0EA5E9` | sky-500 |
| Evidence 证据 | `#F59E0B` | amber-500 |
| Writing Profile 画像 | `#8B5CF6` | violet-500 |
| Cluster 聚类 | `#10B981` | emerald-500 |
| Narrative 叙事 | `#64748B` | slate-500 |
| Anomaly 异常 | `#EF4444` | red-500 |
| Feature 特征 | `#6366F1` | indigo-500 |

**图表风格：**
- 背景：transparent 或 slate-50，无卡片阴影
- 边框：1px solid slate-200，hover 时切换为维度色
- 文字：slate-700 正文，slate-900 标题
- D3 元素：纯色填充，无渐变无阴影，hover 时 opacity 0.8
- 选中态：维度色 2px 边框 + 浅色背景（如 sky-50）
- 非聚焦态：opacity 0.3（FocusContext 激活时未关联元素降灰）
- 章节标题左侧 4px 维度色竖线

## 交互模型

### 交互状态机

```
                    hover
  Overview ──────────────────► Preview Tooltip
     │                              │
     │ click                        │ mouse leave
     ▼                              ▼
  Detail Drawer ◄──────────── Overview
     │
     │ click entity
     ▼
  Cross-Jump (scroll to related section + highlight)
     │
     │ ✕ or Esc
     ▼
  Overview
```

### FocusContext（全局聚焦状态）

```typescript
type FocusContext = {
  entityType: "author" | "text" | "evidence" | "cluster" | "conclusion";
  entityId: string;
  source: string;
} | null;
```

- Zustand store 管理
- 任何 D3 图表的 click 更新此状态
- 所有图表监听变化 → 高亮对应元素 + 降低无关元素 opacity
- 点击空白区域或按 Esc 清除聚焦

### 操作简洁性

- 不使用 drag & drop、右键菜单、复杂手势
- 核心操作只有三个：**滚动阅读**、**hover 预览**、**click 钻取**
- 透镜 Toggle 是唯一的"模式切换"操作

## 卷轴结构

```
┌────────┬──────────────────────────────────────────┐
│ Lens   │  ① Case Header                           │
│ Toggle │  ② Conclusion Rail (结论纵览)             │
│ ────── │  ③ Evidence Chain (证据链)                 │
│ ☐ 特征 │  ④ Writing Profiles (作者画像)             │
│ ☐ 聚类 │  ⑤ Cluster View (聚类视图)                │
│ ☐ 异常 │  ⑥ Narrative Spine (叙事脉络)             │
│ ────── │  ⑦ Appendix / Raw Data                    │
│ Mini   │                                           │
│ map    │                                           │
└────────┴──────────────────────────────────────────┘
```

### ① Case Header

- 现有 ReportHeader 保留，调整为扁平风格
- Verdict Bar：主结论一句话 + 置信度数字 + grade badge，纯色背景

### ② Conclusion Rail

**D3: Horizontal Bar Chart**

- 每个结论一行：grade 色块 + 置信度条 + 一句话摘要
- hover：tooltip 显示关联 evidence 数量和 counter_evidence 数量
- click：展开 Detail Drawer，列出所有 evidence_ids，可跳转到 ③

### ③ Evidence Chain

**D3: Strength Matrix**

- 行 = evidence 按 strength 分组（core / supporting / conflicting）
- 列 = 文本/作者
- ● = 强关联，○ = 弱关联，· = 无关
- hover：tooltip 显示 why_it_matters + counter_readings
- click：Detail Drawer 展示完整 EvidenceItem
- 透镜叠加（特征）：每个 ● 旁附加 sparkline 显示对应 FeatureVector 关键指标

### ④ Writing Profiles

**D3: Parallel Coordinates**

- 替代现有 RadarChart，更适合多作者对比，维度数不受限
- 每个作者一条折线，颜色区分
- 纵轴 = WritingProfileDimension（score 0-100），按 confidence 排序
- hover：高亮该作者，tooltip 显示 headline + observable_summary
- click：展开完整画像卡片
- 透镜叠加（聚类）：折线颜色切换为 cluster 归属色

### ⑤ Cluster View

**D3: Similarity Heatmap + Dendrogram**

- 左侧：余弦相似度热力图（4-5 档离散色阶，无渐变）
- 右侧：简化树状图显示聚类层级
- hover 单元格：tooltip 显示具体相似度值
- click cluster 标签：展开 theme_summary + top_markers
- 透镜叠加（异常）：异常文本行/列加红色边框 + outlier_dimensions badge

### ⑥ Narrative Spine

- 保留现有 NarrativeSpine 时间线设计，去除渐变改为维度色竖线
- 5 个章节：bottom_line → evidence_chain → conflicts → limitations → next_actions
- 实体 ID 替换为人类友好别名
- hover 别名：tooltip 预览原始文本片段
- click 别名：FocusContext 更新 → 上方相关图表高亮

### ⑦ Appendix / Raw Data

- 可折叠的原始数据区域
- 方法论记录、可重现性信息、Agent 原始报告

## Detail Drawer（钻取抽屉）

所有图表的 click 共用同一个 Drawer，从右侧滑入，宽度 480px。

根据 entityType 自适应内容：

| entityType | 展示内容 |
|---|---|
| evidence | 强度、关联结论、why_it_matters、counter_readings、关联特征对比 |
| conclusion | grade、证据列表、反面证据、limitations |
| author | 完整画像卡片、所属 cluster、代表文本列表 |
| text | 文本预览、所属 cluster、关联证据、FeatureVector 全量指标 |
| cluster | theme_summary、separation_summary、top_markers、成员列表 |

### 底层特征展示（Drawer 内）

- **Paired Bar Chart**：两个实体的 FeatureVector 关键指标并排对比
- **Distribution Strip**：点击单个指标 → 展开该指标在所有文本上的分布（D3 strip plot / bee swarm），当前实体用维度色标记

## 透镜机制

- 左侧固定栏 3 个 checkbox：特征 / 聚类 / 异常
- 开启后对应章节的图表即时叠加额外信息层
- 可同时开启多个透镜
- 透镜影响的区域用对应维度色虚线边框标记

## Minimap

- 左下角固定位置，显示 7 个章节的缩略色块
- 当前可视区域用半透明遮罩标记
- 点击跳转到对应章节

## 技术架构

### 组件结构

```
src/components/report/
├── forensic-scroll.tsx        # 卷轴容器，管理章节锚点 + scroll spy
├── scroll-minimap.tsx         # 左下角导航缩略图
├── lens-toggle.tsx            # 左侧透镜 checkbox 面板
├── detail-drawer.tsx          # 右侧钻取抽屉
│
├── sections/                  # 7 个卷轴章节
│   ├── case-header.tsx
│   ├── conclusion-rail.tsx    # D3: horizontal bars
│   ├── evidence-chain.tsx     # D3: strength matrix
│   ├── writing-profiles.tsx   # D3: parallel coordinates
│   ├── cluster-view.tsx       # D3: heatmap + dendrogram
│   ├── narrative-spine.tsx    # 时间线（复用现有，去渐变）
│   └── appendix.tsx
│
├── d3/                        # D3 图表封装
│   ├── horizontal-bars.tsx
│   ├── strength-matrix.tsx
│   ├── parallel-coords.tsx
│   ├── similarity-heatmap.tsx
│   ├── paired-bar-chart.tsx
│   ├── distribution-strip.tsx
│   └── use-d3.ts              # React ↔ D3 桥接 hook
│
└── shared/
    ├── entity-badge.tsx       # 统一的实体标签
    ├── focus-context.ts       # Zustand store: FocusContext
    └── lens-context.ts        # Zustand store: 透镜开关状态
```

### React ↔ D3 集成策略

- `use-d3.ts` hook：React 管理 DOM ref + 数据，D3 只做 SVG 渲染
- React 负责 layout、responsive、状态管理
- D3 负责 scale / axis / shape / transition
- 不用 D3 的 DOM 操控（.append() 等），用 D3 计算能力 + React JSX 渲染 SVG

### 数据流

```
ForensicReport + FeatureVector[]
        │
  ForensicScroll (props)
        │
  ┌─────┼──────┬──────────┐
  │     │      │          │
Section Section Section  Drawer
  │     │      │          │
  └─────┼──────┴──────────┘
        │
  FocusContext (Zustand) ← click 任意实体
        │
  所有 Section 监听 → 高亮/降灰
```

### 与现有组件的关系

| 现有组件 | 处理方式 |
|---------|---------|
| SynthesisPanel | 被 ForensicScroll 替代 |
| ConfidenceRail | 融入 conclusion-rail.tsx |
| WritingPortraitCard + PortraitGallery | 融入 writing-profiles.tsx |
| ClusterLandscape | 融入 cluster-view.tsx |
| EvidenceGraph + EvidenceInspector | 融入 evidence-chain.tsx + detail-drawer.tsx |
| NarrativeSpine | 保留复用，调整样式 |
| ReportHero | 融入 case-header.tsx |

旧组件暂保留不删，新旧切换通过 detail page 的 import 控制。

### 迁移策略（Recharts → D3）

- 新组件全部用 D3
- 旧 Recharts 组件不改动，切换到新卷轴后自然废弃
- 等新组件稳定后再清理旧代码
