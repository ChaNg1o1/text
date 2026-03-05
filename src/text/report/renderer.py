"""Renders ForensicReport to various output formats."""

from __future__ import annotations

from datetime import datetime

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from text.ingest.schema import (
    AgentReport,
    ForensicReport,
    InsightItem,
    PersonaProfile,
    TasteAssessment,
)


def _confidence_color(score: float) -> str:
    """Map a 0-1 confidence score to a rich color name."""
    if score >= 0.75:
        return "green"
    if score >= 0.45:
        return "yellow"
    return "red"


def _confidence_label(score: float) -> str:
    """Human-readable confidence label."""
    if score >= 0.85:
        return "极高"
    if score >= 0.70:
        return "高"
    if score >= 0.50:
        return "中等"
    if score >= 0.30:
        return "低"
    return "极低"


def _format_timestamp(dt: datetime) -> str:
    if dt.tzinfo is not None:
        return dt.strftime("%Y-%m-%d %H:%M:%S %Z")
    return dt.strftime("%Y-%m-%d %H:%M:%S")


class ReportRenderer:
    """Renders ForensicReport to various formats."""

    # ------------------------------------------------------------------
    # Markdown
    # ------------------------------------------------------------------

    @staticmethod
    def to_markdown(report: ForensicReport) -> str:
        """Render as detailed Markdown report."""
        lines: list[str] = []
        w = lines.append  # shorthand

        w("# 文本取证分析报告\n")

        # ---- Overview ----
        w("## 概览\n")
        authors = sorted({t.author for t in report.request.texts})
        w(f"- **任务类型：** {report.request.task.value}")
        w(f"- **分析文本数：** {len(report.request.texts)}")
        w(f"- **作者：** {', '.join(authors) if authors else '未知'}")
        w(f"- **LLM 后端：** {report.request.llm_backend}")
        w(f"- **生成时间：** {_format_timestamp(report.created_at)}")
        w("")

        # ---- Agent Reports (one section per discipline) ----
        discipline_order = [
            "stylometry",
            "psycholinguistics",
            "computational_linguistics",
            "sociolinguistics",
        ]
        discipline_titles = {
            "stylometry": "文体学分析",
            "psycholinguistics": "心理语言学分析",
            "computational_linguistics": "计算语言学分析",
            "sociolinguistics": "社会语言学分析",
        }

        # Index reports by discipline for ordered output; fall back to
        # insertion order for disciplines outside the canonical list.
        report_by_discipline: dict[str, AgentReport] = {
            ar.discipline: ar for ar in report.agent_reports
        }
        seen: set[str] = set()

        for disc in discipline_order:
            if disc in report_by_discipline:
                _render_agent_md(lines, report_by_discipline[disc], discipline_titles.get(disc))
                seen.add(disc)

        # Any remaining disciplines not in the canonical list.
        for ar in report.agent_reports:
            if ar.discipline not in seen:
                _render_agent_md(lines, ar)

        # ---- Synthesis ----
        w("## 综合结论\n")
        if report.synthesis:
            w(report.synthesis)
        else:
            w("*暂无综合分析。*")
        w("")

        if report.contradictions:
            w("### 矛盾与分歧\n")
            for c in report.contradictions:
                w(f"- {c}")
            w("")

        if report.confidence_scores:
            w("### 置信度评分\n")
            w("| 维度 | 分数 | 等级 |")
            w("|------|-----:|------|")
            for dim, score in sorted(report.confidence_scores.items()):
                w(f"| {dim} | {score:.2f} | {_confidence_label(score)} |")
            w("")

        # ---- Taste Scoring & Insights ----
        if report.taste_assessment:
            _render_taste_md(lines, report.taste_assessment)
        if report.insights:
            _render_insights_md(lines, report.insights)

        # ---- Recommendations ----
        if report.recommendations:
            w("## 建议\n")
            for idx, rec in enumerate(report.recommendations, 1):
                w(f"{idx}. {rec}")
            w("")

        if report.persona_profiles:
            w("## 人物侧写\n")
            for profile in report.persona_profiles:
                _render_persona_md(lines, profile)
            w("")

        # ---- Anomaly Samples ----
        if report.anomaly_samples:
            w("## 异常样本\n")
            w(
                f"> 以下 {len(report.anomaly_samples)} 个样本在至少一个特征维度上"
                "偏离群体均值超过 2 个标准差，供人工校准审查。\n"
            )
            for sample in report.anomaly_samples:
                dims_str = ", ".join(
                    f"{name} (z={z:.2f})" for name, z in sorted(
                        sample.outlier_dimensions.items(), key=lambda x: x[1], reverse=True
                    )
                )
                w(f"### {sample.text_id}\n")
                w(f"**异常维度（{len(sample.outlier_dimensions)} 项）：** {dims_str}\n")
                w("**原文：**\n")
                w(f"```\n{sample.content}\n```\n")
            w("")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # JSON
    # ------------------------------------------------------------------

    @staticmethod
    def to_json(report: ForensicReport) -> str:
        """Render as pretty-printed JSON."""
        return report.model_dump_json(indent=2)

    # ------------------------------------------------------------------
    # Rich Console
    # ------------------------------------------------------------------

    @staticmethod
    def to_rich(report: ForensicReport, console: Console) -> None:
        """Render directly to rich Console with panels, tables, and colour."""
        # ---- Overview Panel ----
        authors = sorted({t.author for t in report.request.texts})
        overview_lines = [
            f"[bold]任务类型：[/bold]     {report.request.task.value}",
            f"[bold]分析文本数：[/bold]   {len(report.request.texts)}",
            f"[bold]作者：[/bold]         {', '.join(authors) if authors else '未知'}",
            f"[bold]LLM 后端：[/bold]     {report.request.llm_backend}",
            f"[bold]生成时间：[/bold]     {_format_timestamp(report.created_at)}",
        ]
        console.print(
            Panel(
                "\n".join(overview_lines),
                title="[bold blue]文本取证分析报告[/bold blue]",
                border_style="blue",
                padding=(1, 2),
            )
        )

        # ---- Agent Panels ----
        discipline_order = [
            "stylometry",
            "psycholinguistics",
            "computational_linguistics",
            "sociolinguistics",
        ]
        report_by_discipline: dict[str, AgentReport] = {
            ar.discipline: ar for ar in report.agent_reports
        }
        seen: set[str] = set()
        for disc in discipline_order:
            if disc in report_by_discipline:
                _render_agent_rich(console, report_by_discipline[disc])
                seen.add(disc)
        for ar in report.agent_reports:
            if ar.discipline not in seen:
                _render_agent_rich(console, ar)

        # ---- Confidence Table ----
        if report.confidence_scores:
            table = Table(
                title="置信度评分",
                show_header=True,
                header_style="bold magenta",
                border_style="dim",
            )
            table.add_column("维度", style="bold")
            table.add_column("分数", justify="right")
            table.add_column("等级")

            for dim, score in sorted(report.confidence_scores.items()):
                color = _confidence_color(score)
                table.add_row(
                    dim,
                    f"[{color}]{score:.2f}[/{color}]",
                    f"[{color}]{_confidence_label(score)}[/{color}]",
                )
            console.print(table)
            console.print()

        if report.taste_assessment:
            _render_taste_rich(console, report.taste_assessment)
        if report.insights:
            _render_insights_rich(console, report.insights)

        # ---- Synthesis ----
        if report.synthesis:
            console.print(
                Panel(
                    Markdown(report.synthesis),
                    title="[bold cyan]综合结论[/bold cyan]",
                    border_style="cyan",
                    padding=(1, 2),
                )
            )

        # ---- Contradictions ----
        if report.contradictions:
            contra_text = "\n".join(f"- {c}" for c in report.contradictions)
            console.print(
                Panel(
                    Markdown(contra_text),
                    title="[bold yellow]矛盾与分歧[/bold yellow]",
                    border_style="yellow",
                    padding=(1, 2),
                )
            )

        # ---- Recommendations ----
        if report.recommendations:
            rec_text = "\n".join(f"{i}. {r}" for i, r in enumerate(report.recommendations, 1))
            console.print(
                Panel(
                    Markdown(rec_text),
                    title="[bold green]建议[/bold green]",
                    border_style="green",
                    padding=(1, 2),
                )
            )

        if report.persona_profiles:
            _render_persona_rich(console, report.persona_profiles)

        # ---- Anomaly Samples ----
        if report.anomaly_samples:
            _render_anomaly_samples_rich(console, report)

    # ------------------------------------------------------------------
    # Short summary
    # ------------------------------------------------------------------

    @staticmethod
    def to_summary(report: ForensicReport) -> str:
        """Short summary suitable for CLI one-liner output."""
        authors = sorted({t.author for t in report.request.texts})
        parts = [
            f"任务：{report.request.task.value}",
            f"文本数：{len(report.request.texts)}",
            f"作者：{', '.join(authors[:5])}{'...' if len(authors) > 5 else ''}",
            f"代理数：{len(report.agent_reports)}",
        ]

        if report.confidence_scores:
            avg = sum(report.confidence_scores.values()) / len(report.confidence_scores)
            parts.append(f"平均置信度：{avg:.2f}")
        if report.taste_assessment is not None:
            parts.append(f"品味分：{report.taste_assessment.overall_score:.1f}/100")

        if report.synthesis:
            # First sentence of the synthesis as a teaser.
            # Support both Chinese (。) and English (.) sentence endings.
            import re

            m = re.search(r"[.。!！?？]", report.synthesis)
            first_sentence = report.synthesis[: m.end()].strip() if m else report.synthesis[:100]
            if first_sentence:
                parts.append(f"摘要：{first_sentence}")

        return " | ".join(parts)


# ======================================================================
# Module-level helpers (not exposed in the public API)
# ======================================================================


def _render_agent_md(
    lines: list[str],
    ar: AgentReport,
    title: str | None = None,
) -> None:
    """Append Markdown lines for a single AgentReport."""
    heading = title or f"{ar.discipline.replace('_', ' ').title()} 分析"
    lines.append(f"## {heading}\n")

    if ar.summary:
        lines.append(ar.summary)
        lines.append("")

    for finding in ar.findings:
        lines.append(
            f"### {finding.category} "
            f"（置信度：{finding.confidence:.2f} - {_confidence_label(finding.confidence)}）\n"
        )
        lines.append(finding.description)
        lines.append("")
        if finding.evidence:
            lines.append("**证据：**\n")
            for ev in finding.evidence:
                lines.append(f"- {ev}")
            lines.append("")


def _render_agent_rich(console: Console, ar: AgentReport) -> None:
    """Print a rich Panel for a single AgentReport."""
    content_parts: list[str] = []

    if ar.summary:
        content_parts.append(ar.summary)
        content_parts.append("")

    for finding in ar.findings:
        color = _confidence_color(finding.confidence)
        content_parts.append(
            f"**{finding.category}** "
            f"[{color}]（置信度：{finding.confidence:.2f} - "
            f"{_confidence_label(finding.confidence)}）[/{color}]"
        )
        content_parts.append("")
        content_parts.append(finding.description)
        if finding.evidence:
            content_parts.append("")
            for ev in finding.evidence:
                content_parts.append(f"- {ev}")
        content_parts.append("")

    body = "\n".join(content_parts) if content_parts else "*暂无发现。*"
    title_text = f"{ar.discipline.replace('_', ' ').title()} ({ar.agent_name})"

    console.print(
        Panel(
            Markdown(body),
            title=f"[bold magenta]{title_text}[/bold magenta]",
            border_style="magenta",
            padding=(1, 2),
        )
    )


def _render_persona_md(lines: list[str], profile: PersonaProfile) -> None:
    """Append markdown section for a persona profile."""
    lines.append(f"### {profile.subject}\n")
    if profile.summary:
        lines.append(profile.summary)
        lines.append("")
    if profile.overall_confidence is not None:
        lines.append(f"- **总体置信度：** {profile.overall_confidence:.2f}")
    if not profile.dimensions:
        lines.append("- *暂无维度数据*")
        lines.append("")
        return

    lines.append("| 维度 | 分数 | 置信度 |")
    lines.append("|------|-----:|------:|")
    for dim in profile.dimensions:
        lines.append(f"| {dim.label} | {dim.score:.1f} | {dim.confidence:.2f} |")
        if dim.evidence_spans:
            lines.append(f"- 证据：{'; '.join(dim.evidence_spans[:3])}")
        if dim.counter_evidence:
            lines.append(f"- 反证：{'; '.join(dim.counter_evidence[:2])}")
    lines.append("")


def _render_persona_rich(console: Console, profiles: list[PersonaProfile]) -> None:
    """Render persona profiles with compact rich tables."""
    for profile in profiles:
        table = Table(
            title=f"人物侧写：{profile.subject}",
            show_header=True,
            header_style="bold cyan",
            border_style="dim",
        )
        table.add_column("维度", style="bold")
        table.add_column("分数", justify="right")
        table.add_column("置信度", justify="right")
        table.add_column("证据")
        table.add_column("反证")

        if profile.dimensions:
            for dim in profile.dimensions:
                table.add_row(
                    dim.label,
                    f"{dim.score:.1f}",
                    f"{dim.confidence:.2f}",
                    "; ".join(dim.evidence_spans[:2]) or "-",
                    "; ".join(dim.counter_evidence[:2]) or "-",
                )
        else:
            table.add_row("暂无维度数据", "-", "-", "-", "-")

        if profile.summary:
            console.print(
                Panel(
                    Markdown(profile.summary),
                    title=f"[bold cyan]人物侧写摘要：{profile.subject}[/bold cyan]",
                    border_style="cyan",
                    padding=(1, 2),
                )
            )
        table.caption = (
            f"总体置信度：{profile.overall_confidence:.2f}"
            if profile.overall_confidence is not None
            else ""
        )
        console.print(table)
        console.print()
    console.print()


def _render_taste_md(lines: list[str], taste: TasteAssessment) -> None:
    """Append markdown section for corpus-level taste assessment."""
    lines.append("## 品味量化（Taste）\n")
    lines.append(f"- **总体品味分：** {taste.overall_score:.1f} / 100")
    if taste.methodology:
        lines.append(f"- **评分方法：** {taste.methodology}")
    lines.append("")

    if taste.dimension_scores:
        lines.append("| 维度 | 分数 |")
        lines.append("|------|-----:|")
        for key, value in sorted(taste.dimension_scores.items(), key=lambda kv: kv[1], reverse=True):
            lines.append(f"| {key} | {value:.1f} |")
        lines.append("")

    if taste.strengths:
        lines.append("**优势维度：**")
        for item in taste.strengths:
            lines.append(f"- {item}")
        lines.append("")

    if taste.risks:
        lines.append("**风险维度：**")
        for item in taste.risks:
            lines.append(f"- {item}")
        lines.append("")


def _render_insights_md(lines: list[str], insights: list[InsightItem]) -> None:
    """Append markdown section for ranked insights."""
    lines.append("## 高质量洞见（Top Insights）\n")
    for item in insights:
        lines.append(
            f"### #{item.rank} {item.category} "
            f"（Taste={item.taste_score:.1f}，置信度={item.confidence:.2f}）\n"
        )
        lines.append(item.insight)
        lines.append("")
        lines.append(f"- 学科来源：{item.discipline}")
        if item.supporting_disciplines:
            lines.append(f"- 交叉支持：{', '.join(item.supporting_disciplines)}")
        if item.dimension_scores:
            dims_str = ", ".join(
                f"{name}={score:.1f}" for name, score in sorted(
                    item.dimension_scores.items(), key=lambda kv: kv[1], reverse=True
                )
            )
            lines.append(f"- 维度评分：{dims_str}")
        if item.evidence:
            lines.append("- 证据：")
            for ev in item.evidence:
                lines.append(f"  - {ev}")
        lines.append("")


def _render_taste_rich(console: Console, taste: TasteAssessment) -> None:
    """Render corpus-level taste summary with rich tables."""
    table = Table(
        title=f"品味量化总览（Overall: {taste.overall_score:.1f}/100）",
        show_header=True,
        header_style="bold cyan",
        border_style="cyan",
    )
    table.add_column("维度", style="bold")
    table.add_column("分数", justify="right")
    for key, value in sorted(taste.dimension_scores.items(), key=lambda kv: kv[1], reverse=True):
        table.add_row(key, f"{value:.1f}")
    console.print(table)

    notes: list[str] = []
    if taste.strengths:
        notes.append("**优势**")
        notes.extend(f"- {item}" for item in taste.strengths)
    if taste.risks:
        notes.append("**风险**")
        notes.extend(f"- {item}" for item in taste.risks)
    if taste.methodology:
        notes.append(f"**方法**\n- {taste.methodology}")
    if notes:
        console.print(
            Panel(
                Markdown("\n".join(notes)),
                title="[bold cyan]Taste 说明[/bold cyan]",
                border_style="cyan",
                padding=(1, 2),
            )
        )
    console.print()


def _render_insights_rich(console: Console, insights: list[InsightItem]) -> None:
    """Render top insights as a compact rich table."""
    table = Table(
        title=f"高质量洞见（Top {len(insights)}）",
        show_header=True,
        header_style="bold green",
        border_style="green",
        show_lines=True,
    )
    table.add_column("Rank", justify="right")
    table.add_column("Taste", justify="right")
    table.add_column("置信度", justify="right")
    table.add_column("学科")
    table.add_column("类别")
    table.add_column("洞见", max_width=70)

    for item in insights:
        table.add_row(
            str(item.rank),
            f"{item.taste_score:.1f}",
            f"{item.confidence:.2f}",
            item.discipline,
            item.category,
            item.insight,
        )
    console.print(table)
    console.print()


_ANOMALY_CONTENT_PREVIEW = 300


def _render_anomaly_samples_rich(console: Console, report: ForensicReport) -> None:
    """Render anomaly samples as a rich table + expandable content."""
    console.print()

    table = Table(
        title=f"异常样本（共 {len(report.anomaly_samples)} 个）",
        show_header=True,
        header_style="bold red",
        border_style="red",
        show_lines=True,
    )
    table.add_column("样本 ID", style="bold", max_width=20)
    table.add_column("异常维度", max_width=50)
    table.add_column("原文预览", max_width=60)

    for sample in report.anomaly_samples:
        dims = ", ".join(
            f"{name} [bold](z={z:.2f})[/bold]"
            for name, z in sorted(
                sample.outlier_dimensions.items(), key=lambda x: x[1], reverse=True
            )
        )
        preview = sample.content[:_ANOMALY_CONTENT_PREVIEW]
        if len(sample.content) > _ANOMALY_CONTENT_PREVIEW:
            preview += "..."
        table.add_row(sample.text_id[:16], dims, preview)

    console.print(table)
    console.print()
