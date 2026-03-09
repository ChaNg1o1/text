"""Renders ForensicReport to various output formats."""

from __future__ import annotations

from datetime import datetime
import json

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

from text.ingest.schema import (
    ConclusionGrade,
    ForensicReport,
    WritingProfile,
)


def _format_timestamp(dt: datetime) -> str:
    if dt.tzinfo is not None:
        return dt.strftime("%Y-%m-%d %H:%M:%S %Z")
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _grade_label(grade: ConclusionGrade) -> str:
    mapping = {
        ConclusionGrade.STRONG_SUPPORT: "强支持",
        ConclusionGrade.MODERATE_SUPPORT: "中等支持",
        ConclusionGrade.INCONCLUSIVE: "无法判断",
        ConclusionGrade.MODERATE_AGAINST: "中等反对",
        ConclusionGrade.STRONG_AGAINST: "强反对",
    }
    return mapping[grade]


class ReportRenderer:
    """Renders ForensicReport to various formats."""

    @staticmethod
    def to_markdown(report: ForensicReport) -> str:
        lines: list[str] = []
        w = lines.append
        authors = sorted({text.author for text in report.request.texts})

        w("# 文本调查报告\n")
        w("## 调查摘要与结论分级\n")
        w(report.summary or "*暂无摘要。*")
        w("")
        if report.conclusions:
            w("| 结论 | 任务 | 分级 | 分数 |")
            w("|------|------|------|------|")
            for conclusion in report.conclusions:
                score = f"{conclusion.score:.2f}" if conclusion.score is not None else "-"
                w(
                    f"| {conclusion.statement} | {conclusion.task.value} | "
                    f"{_grade_label(conclusion.grade)} | {score} |"
                )
            w("")

        if report.narrative:
            w("## 叙事章节\n")
            if report.narrative.lead:
                w(f"**一句话结论：** {report.narrative.lead}")
                w("")
            for section in report.narrative.sections:
                w(f"### {section.title}\n")
                if section.summary:
                    w(section.summary)
                if section.detail:
                    w(section.detail)
                if section.evidence_ids:
                    w(f"- 证据锚点：{', '.join(section.evidence_ids)}")
                if section.result_keys:
                    w(f"- 结果键：{', '.join(section.result_keys)}")
                w("")
            if report.narrative.action_items:
                w("### 行动建议\n")
                for item in report.narrative.action_items:
                    w(f"- {item}")
                w("")
            if report.narrative.contradictions:
                w("### 矛盾信号\n")
                for item in report.narrative.contradictions:
                    w(f"- {item}")
                w("")

        w("## 案件信息\n")
        w(f"- **任务类型：** {report.request.task.value}")
        w(f"- **文本数：** {len(report.request.texts)}")
        w(f"- **作者/账号数：** {len(authors)}")
        if report.request.case_metadata:
            metadata = report.request.case_metadata
            if metadata.case_id:
                w(f"- **案件编号：** {metadata.case_id}")
            if metadata.client:
                w(f"- **委托方：** {metadata.client}")
            if metadata.analyst:
                w(f"- **分析员：** {metadata.analyst}")
        w(f"- **生成时间：** {_format_timestamp(report.created_at)}")
        w("")

        if report.entity_aliases:
            w("## 别名图例\n")
            if report.entity_aliases.author_aliases:
                w("| 作者 ID | 别名 |")
                w("|---------|------|")
                for item in report.entity_aliases.author_aliases:
                    w(f"| {item.author_id} | {item.alias} |")
                w("")
            if report.entity_aliases.text_aliases:
                w("| 文本 ID | 别名 | 作者 | 预览 |")
                w("|---------|------|------|------|")
                for item in report.entity_aliases.text_aliases:
                    w(
                        f"| {item.text_id} | {item.alias} | {item.author} | "
                        f"{item.preview or '-'} |"
                    )
                w("")

        if report.cluster_view and report.cluster_view.clusters:
            w("## 聚类结构表\n")
            w("| 簇 | 成员别名 | 风格解释 | 区分点 | 代表文本 |")
            w("|----|----------|----------|--------|----------|")
            for cluster in report.cluster_view.clusters:
                w(
                    f"| {cluster.label} | {', '.join(cluster.member_aliases) or '-'} | "
                    f"{cluster.theme_summary or '-'} | "
                    f"{cluster.separation_summary or '-'} | "
                    f"{cluster.representative_text_id or '-'} |"
                )
                if cluster.top_markers:
                    w(f"- 标记：{'；'.join(cluster.top_markers)}")
                if cluster.confidence_note:
                    w(f"- 解释边界：{cluster.confidence_note}")
                if cluster.representative_excerpt:
                    w(f"- 代表片段：{cluster.representative_excerpt}")
            if report.cluster_view.excluded_text_ids:
                w("")
                w("- 排除文本（长度不足）：")
                for text_id in report.cluster_view.excluded_text_ids:
                    w(f"  - {text_id}")
            w("")

        w("## 材料清单\n")
        if report.materials:
            w("| 材料 | SHA-256 | 字节数 | 文本 ID |")
            w("|------|---------|-------:|--------|")
            for item in report.materials:
                w(
                    f"| {item.source_name} | `{item.sha256}` | {item.byte_count} | "
                    f"{', '.join(item.text_ids) or '-'} |"
                )
        else:
            w("*暂无材料记录。*")
        w("")

        w("## 方法说明\n")
        for item in report.methods:
            w(f"### {item.title}\n")
            w(item.description)
            if item.parameters:
                w(f"- 参数：`{json.dumps(item.parameters, ensure_ascii=False)}`")
            w("")

        w("## 分析结果\n")
        for item in report.results:
            kind = "解释性意见" if item.interpretive_opinion else "确定性结果"
            w(f"### {item.title}（{kind}）\n")
            w(item.body or "*暂无内容*")
            if item.evidence_ids:
                w(f"- 证据 ID：{', '.join(item.evidence_ids)}")
            if item.supporting_agents:
                w(f"- 支撑 Agent：{', '.join(item.supporting_agents)}")
            w("")

        if report.evidence_items:
            w("### 证据摘要\n")
            for item in report.evidence_items:
                w(f"- **{item.evidence_id} / {item.label}：** {item.summary}")
                if item.finding:
                    w(f"  - 说明：{item.finding}")
                if item.why_it_matters:
                    w(f"  - 重要性：{item.why_it_matters}")
                if item.counter_readings:
                    w(f"  - 反向解释：{'；'.join(item.counter_readings[:3])}")
                if item.linked_conclusion_keys:
                    w(f"  - 关联结论：{', '.join(item.linked_conclusion_keys)}")
                if item.excerpts:
                    w(f"  - 片段：{'；'.join(item.excerpts[:3])}")
            w("")

        if report.writing_profiles:
            w("### 写作画像\n")
            for profile in report.writing_profiles:
                _render_profile_md(lines, profile)
            w("")

        w("## 误差与限制\n")
        if report.limitations:
            for limitation in report.limitations:
                w(f"- {limitation}")
        else:
            w("*暂无额外限制。*")
        w("")

        w("## 可复现信息\n")
        repro = report.reproducibility
        w(f"- **pipeline version：** {repro.pipeline_version}")
        w(f"- **threshold profile：** {repro.threshold_profile_version}")
        w(f"- **request fingerprint：** `{repro.request_fingerprint or '-'}`")
        w(f"- **report hash：** `{repro.report_sha256 or '-'}`")
        w(f"- **generated at：** {_format_timestamp(repro.generated_at)}")
        if repro.parameter_snapshot:
            w(f"- **parameters：** `{json.dumps(repro.parameter_snapshot, ensure_ascii=False)}`")
        w("")

        w("## 附录\n")
        if report.appendix:
            for item in report.appendix:
                w(f"### {item.title}\n")
                w(f"```json\n{item.content}\n```\n")
        else:
            w("*暂无附录。*")
        return "\n".join(lines)

    @staticmethod
    def to_json(report: ForensicReport) -> str:
        return report.model_dump_json(indent=2)

    @staticmethod
    def to_rich(report: ForensicReport, console: Console) -> None:
        console.print(
            Panel(
                Markdown(ReportRenderer.to_markdown(report)),
                title="[bold blue]文本调查报告[/bold blue]",
                border_style="blue",
            )
        )

    @staticmethod
    def to_summary(report: ForensicReport) -> str:
        if report.conclusions:
            lead = report.conclusions[0]
            return (
                f"任务：{report.request.task.value} | 结论数：{len(report.conclusions)} | "
                f"主结论：{lead.statement}"
            )
        return f"任务：{report.request.task.value} | 未生成结构化结论"


def _render_profile_md(lines: list[str], profile: WritingProfile) -> None:
    lines.append(f"#### {profile.subject}\n")
    if profile.headline:
        lines.append(f"**画像标题：** {profile.headline}")
    if profile.summary:
        lines.append(profile.summary)
    if profile.observable_summary:
        lines.append(profile.observable_summary)
    if profile.stable_habits:
        lines.append("- 稳定习惯：")
        for item in profile.stable_habits:
            lines.append(f"  - {item}")
    if profile.process_clues:
        lines.append("- 过程线索（辅助解读）：")
        for item in profile.process_clues:
            lines.append(f"  - {item}")
    if profile.anomalies:
        lines.append("- 异常点：")
        for item in profile.anomalies:
            lines.append(f"  - {item}")
    if profile.confidence_note:
        lines.append(f"- 可信边界：{profile.confidence_note}")
    if profile.representative_text_ids:
        lines.append(f"- 代表文本：{', '.join(profile.representative_text_ids)}")
    lines.append("| 维度 | 分数 | 置信度 | 类型 |")
    lines.append("|------|-----:|------:|------|")
    for dim in profile.dimensions:
        lines.append(
            f"| {dim.label} | {dim.score:.1f} | {dim.confidence:.2f} | {dim.dimension_type} |"
        )
        if dim.evidence_spans:
            lines.append(f"- 证据：{'；'.join(dim.evidence_spans[:2])}")
        if dim.counter_evidence:
            lines.append(f"- 反证：{'；'.join(dim.counter_evidence[:2])}")
    lines.append("")
