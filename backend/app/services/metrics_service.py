from __future__ import annotations

from typing import Any

from app.schemas.metrics import ReportMetrics


def _safe_ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(max(0.0, min(1.0, numerator / denominator)), 4)


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def calculate_report_metrics(state: dict) -> dict:
    """Calculate report metrics from the current workflow state."""
    evidence_list = [
        evidence for evidence in _as_list(state.get("evidence_list", []))
        if isinstance(evidence, dict)
    ]
    claims = [
        claim for claim in _as_list(state.get("claims", []))
        if isinstance(claim, dict)
    ]
    focus_dimensions = [
        str(dimension).strip()
        for dimension in _as_list(state.get("focus_dimensions", []))
        if str(dimension).strip()
    ]
    quality_result = state.get("quality_result", {})
    if not isinstance(quality_result, dict):
        quality_result = {}

    evidence_count = len(evidence_list)
    claim_count = len(claims)

    claims_with_evidence = sum(
        1
        for claim in claims
        if isinstance(claim.get("evidence_ids"), list) and len(claim.get("evidence_ids", [])) > 0
    )
    covered_dimensions = {
        str(evidence.get("related_dimension") or evidence.get("dimension") or "").strip()
        for evidence in evidence_list
    }
    covered_dimensions.discard("")

    high_credibility_count = sum(
        1
        for evidence in evidence_list
        if str(evidence.get("credibility", "")).lower() == "high"
    )
    low_credibility_count = sum(
        1
        for evidence in evidence_list
        if str(evidence.get("credibility", "")).lower() == "low"
    )

    metrics = ReportMetrics(
        evidence_count=evidence_count,
        claim_count=claim_count,
        citation_rate=_safe_ratio(claims_with_evidence, claim_count),
        coverage_rate=_safe_ratio(len(covered_dimensions), len(focus_dimensions)),
        high_credibility_ratio=_safe_ratio(high_credibility_count, evidence_count),
        low_credibility_ratio=_safe_ratio(low_credibility_count, evidence_count),
        quality_score=float(quality_result.get("score", quality_result.get("quality_score", 0)) or 0),
        iteration_count=int(state.get("iteration_count", 0) or 0),
    )
    return metrics.model_dump()
