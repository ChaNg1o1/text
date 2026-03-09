from __future__ import annotations

from text.api.services.analysis_runner import _format_duration


def test_format_duration_preserves_short_run_visibility() -> None:
    assert _format_duration(0.00042) == "0.42ms"
    assert _format_duration(0.013) == "13.0ms"
    assert _format_duration(0.42) == "420ms"
    assert _format_duration(2.345) == "2.35s"
