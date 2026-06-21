"""Verification Agent - faithfulness check over claims and matrix conclusions.

Runs after AnalysisAgent and before QualityAgent. It does not create or edit
claims (the ``merge_claims`` reducer keeps the first version of each claim_id, so edits
would be ignored). Instead it produces a separate ``faithfulness_report`` and a list of
``unsupported_claim_ids`` that downstream agents consume:

- QualityAgent gates on ``unsupported_claim_ids`` (routes back to the owning agent),
- ReportAgent excludes unsupported claims from the final report,
- QualityAgent lowers report credibility for unsupported claims,
- metrics expose ``faithfulness_rate``.
"""

from __future__ import annotations

from typing import Any, Dict, List

from app.services.faithfulness import verify_claims


def _matrix_issues(state: dict, report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Surface matrix cells whose prose contains numbers not present in their evidence."""
    import re

    from app.services.faithfulness import _evidence_by_id, _numbers, _significant_numbers, _evidence_text

    def _strip_evidence_ids(text: str) -> str:
        return re.sub(r"(?<![A-Za-z0-9])EV\d{3,}(?![A-Za-z0-9])", "", text or "")

    evidence_by_id = _evidence_by_id(
        [item for item in state.get("evidence_list", []) if isinstance(item, dict)]
    )
    issues: List[Dict[str, Any]] = []

    for matrix_name in ("product_matrix", "business_matrix"):
        matrix = state.get(matrix_name, {})
        dimensions = matrix.get("dimensions", {}) if isinstance(matrix, dict) else {}
        if not isinstance(dimensions, dict):
            continue
        for dimension, platform_map in dimensions.items():
            if not isinstance(platform_map, dict):
                continue
            for platform, cell in platform_map.items():
                if not isinstance(cell, dict):
                    continue
                analysis = str(cell.get("analysis") or cell.get("summary") or "")
                cited_ids = [str(i) for i in cell.get("evidence_ids", []) if str(i)]
                cited_text = " ".join(
                    _evidence_text(evidence_by_id[i]) for i in cited_ids if i in evidence_by_id
                )
                cleaned_analysis = _strip_evidence_ids(analysis).replace(str(platform), "")
                analysis_numbers = _significant_numbers(cleaned_analysis)
                evidence_numbers = _numbers(_strip_evidence_ids(cited_text))
                missing = sorted(n for n in analysis_numbers if n not in evidence_numbers)
                if missing:
                    issues.append(
                        {
                            "matrix": matrix_name,
                            "platform": platform,
                            "dimension": dimension,
                            "missing_numbers": missing,
                        }
                    )
    return issues


def _append_trace(state: dict, report: Dict[str, Any]) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "VerificationAgent",
            "status": "success",
            "output_summary": (
                f"verified {report['checked_claim_count']} claims, "
                f"{report['unsupported_claim_count']} unsupported, "
                f"faithfulness_rate={report['faithfulness_rate']}"
            ),
            "error": None,
        }
    )


def verification_agent(state: dict) -> Dict[str, Any]:
    """Verify claim/matrix faithfulness and expose a report for downstream agents."""
    claims = [item for item in state.get("claims", []) if isinstance(item, dict)]
    evidence_list = [item for item in state.get("evidence_list", []) if isinstance(item, dict)]

    report = verify_claims(claims, evidence_list)
    report["matrix_issues"] = _matrix_issues(state, report)

    next_state = {
        **state,
        "current_agent": "VerificationAgent",
        "faithfulness_report": report,
        "unsupported_claim_ids": report["unsupported_claim_ids"],
    }
    _append_trace(next_state, report)

    print(
        f"[VerificationAgent] 忠实性校验完成，"
        f"忠实率 {report['faithfulness_rate']}，未支撑 claim {report['unsupported_claim_count']} 条"
    )
    return next_state
