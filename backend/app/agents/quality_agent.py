"""Quality Agent - run rule-based checks and route rejected work."""

from __future__ import annotations

import re
from typing import Any, Dict, List

from app.schemas.quality import QualityResult


MAX_ITERATIONS = 3
ROUTER_MAP = {
    "ResearchAgent": "research_agent",
    "EvidenceAgent": "evidence_agent",
    "ProductAgent": "product_agent",
    "BusinessAgent": "business_agent",
    "RiskAgent": "risk_agent",
    "StrategyAgent": "strategy_agent",
}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value)


def _dimension_key(value: Any) -> str:
    return re.sub(r"[\s_\-]+", "", _as_text(value).lower())


def _evidence_ids(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        candidates = re.findall(r"EV\d{3,}", value)
    elif isinstance(value, list):
        candidates = [_as_text(item) for item in value]
    else:
        candidates = [_as_text(value)]

    result: List[str] = []
    for evidence_id in candidates:
        if evidence_id and evidence_id not in result:
            result.append(evidence_id)
    return result


def _matrix_not_empty(matrix: Any) -> bool:
    if not isinstance(matrix, dict):
        return False
    dimensions = matrix.get("dimensions")
    if not isinstance(dimensions, dict) or not dimensions:
        return False
    return any(
        isinstance(platform_map, dict) and bool(platform_map)
        for platform_map in dimensions.values()
    )


def _claim_owner(claim: Dict[str, Any]) -> str:
    claim_id = _as_text(claim.get("claim_id"))
    if claim_id.startswith("PCL"):
        return "ProductAgent"
    if claim_id.startswith("BCL"):
        return "BusinessAgent"
    return "ProductAgent"


def _risk_reject_target(risk: Dict[str, Any]) -> str:
    risk_type = _as_text(risk.get("risk_type"))
    if risk_type in {"evidence_gap", "data_credibility", "data_timeliness"}:
        return "EvidenceAgent"
    if risk_type == "compliance":
        return "ResearchAgent"
    return "EvidenceAgent"


def _build_checked_items(
    evidence_list: List[Dict[str, Any]],
    claims: List[Dict[str, Any]],
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
    risk_flags: List[Dict[str, Any]],
    competitors: List[str],
    focus_dimensions: List[str],
) -> tuple[Dict[str, bool], List[str], List[str], List[str], str | None]:
    existing_evidence_ids = {
        _as_text(evidence.get("evidence_id"))
        for evidence in evidence_list
        if isinstance(evidence, dict) and evidence.get("evidence_id")
    }
    platforms_in_evidence = {
        _as_text(evidence.get("platform"))
        for evidence in evidence_list
        if isinstance(evidence, dict) and _as_text(evidence.get("platform"))
    }
    dimensions_in_evidence = {
        _dimension_key(evidence.get("related_dimension") or evidence.get("dimension"))
        for evidence in evidence_list
        if isinstance(evidence, dict)
        and _dimension_key(evidence.get("related_dimension") or evidence.get("dimension"))
    }

    missing_platforms = [
        competitor
        for competitor in competitors
        if _as_text(competitor) and _as_text(competitor) not in platforms_in_evidence
    ]
    missing_dimensions = [
        dimension
        for dimension in focus_dimensions
        if _as_text(dimension) and _dimension_key(dimension) not in dimensions_in_evidence
    ]

    claims_without_evidence = [
        claim
        for claim in claims
        if isinstance(claim, dict) and not _evidence_ids(claim.get("evidence_ids"))
    ]
    claims_with_invalid_evidence = []
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        ids = _evidence_ids(claim.get("evidence_ids"))
        if ids and any(evidence_id not in existing_evidence_ids for evidence_id in ids):
            claims_with_invalid_evidence.append(claim)

    high_risks = [
        risk
        for risk in risk_flags
        if isinstance(risk, dict) and _as_text(risk.get("severity")).lower() == "high"
    ]

    checked_items = {
        "all_claims_have_evidence": not claims_without_evidence,
        "all_evidence_ids_valid": not claims_with_invalid_evidence,
        "all_competitors_covered": not missing_platforms,
        "all_dimensions_covered": not missing_dimensions,
        "product_matrix_not_empty": _matrix_not_empty(product_matrix),
        "business_matrix_not_empty": _matrix_not_empty(business_matrix),
        "no_high_severity_risk": not high_risks,
    }

    required_actions: List[str] = []
    reject_to: str | None = None

    if claims_without_evidence:
        reject_to = _claim_owner(claims_without_evidence[0])
        required_actions.append("补充 claims 中缺失的 evidence_ids。")

    if claims_with_invalid_evidence:
        reject_to = reject_to or _claim_owner(claims_with_invalid_evidence[0])
        required_actions.append("修正 claims 中不存在的 evidence_ids。")

    if missing_platforms:
        reject_to = reject_to or "EvidenceAgent"
        required_actions.append("补充缺失竞品的 evidence。")

    if missing_dimensions:
        reject_to = reject_to or "EvidenceAgent"
        required_actions.append("补充缺失维度的 evidence。")

    if not checked_items["product_matrix_not_empty"]:
        reject_to = reject_to or "ProductAgent"
        required_actions.append("重新生成 product_matrix。")

    if not checked_items["business_matrix_not_empty"]:
        reject_to = reject_to or "BusinessAgent"
        required_actions.append("重新生成 business_matrix。")

    if high_risks:
        reject_to = reject_to or _risk_reject_target(high_risks[0])
        required_actions.append("处理 high severity 风险后再进入策略生成。")

    return checked_items, missing_dimensions, missing_platforms, required_actions, reject_to


def _quality_result_with_legacy_fields(result: QualityResult, reason: str) -> Dict[str, Any]:
    data = result.model_dump()
    data.update(
        {
            "status": "approved" if result.approved else "rejected",
            "quality_score": result.score,
            "reason": reason,
            "passed_checks": [
                name for name, passed in result.checked_items.items() if passed
            ],
            "failed_checks": [
                name for name, passed in result.checked_items.items() if not passed
            ],
        }
    )
    if not result.approved:
        data["target_agent"] = result.reject_to
        data["required_fix"] = "；".join(result.required_actions)
    return data


def _append_trace(state: dict, quality_result: QualityResult) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "QualityAgent",
            "status": "success" if quality_result.approved else "rejected",
            "output_summary": (
                "quality approved"
                if quality_result.approved
                else f"quality rejected to {quality_result.reject_to}"
            ),
            "error": None,
        }
    )


def quality_agent(state: dict) -> Dict[str, Any]:
    """Run quality checks and set approval or a structured rejection target."""
    evidence_list = [
        item for item in state.get("evidence_list", [])
        if isinstance(item, dict)
    ]
    claims = [
        item for item in state.get("claims", [])
        if isinstance(item, dict)
    ]
    product_matrix = state.get("product_matrix", {})
    business_matrix = state.get("business_matrix", {})
    risk_flags = [
        item for item in state.get("risk_flags", [])
        if isinstance(item, dict)
    ]
    competitors = [
        _as_text(item) for item in state.get("competitors", [])
        if _as_text(item)
    ]
    focus_dimensions = [
        _as_text(item) for item in state.get("focus_dimensions", [])
        if _as_text(item)
    ]
    iteration_count = int(state.get("iteration_count", 0) or 0)

    (
        checked_items,
        missing_dimensions,
        missing_platforms,
        required_actions,
        reject_to,
    ) = _build_checked_items(
        evidence_list=evidence_list,
        claims=claims,
        product_matrix=product_matrix if isinstance(product_matrix, dict) else {},
        business_matrix=business_matrix if isinstance(business_matrix, dict) else {},
        risk_flags=risk_flags,
        competitors=competitors,
        focus_dimensions=focus_dimensions,
    )

    approved = all(checked_items.values())
    deductions = sum(1 for passed in checked_items.values() if not passed) * 10
    if not checked_items["no_high_severity_risk"]:
        deductions += 20
    score = 90 if approved else max(0, 90 - deductions)
    reject_reason = None if approved else "部分质量检查未通过"

    quality_result = QualityResult(
        approved=approved,
        score=score,
        reject_to=None if approved else reject_to or "EvidenceAgent",
        reject_reason=reject_reason,
        missing_dimensions=missing_dimensions,
        missing_platforms=missing_platforms,
        required_actions=[] if approved else required_actions,
        checked_items=checked_items,
    )

    needs_human_review = False
    quality_status = "approved" if quality_result.approved else "rejected"
    next_iteration_count = iteration_count
    rejected_agents = list(state.get("rejected_agents", []))

    if not quality_result.approved:
        if quality_result.reject_to:
            rejected_agents.append(quality_result.reject_to)
        next_iteration_count = iteration_count + 1
        if next_iteration_count >= MAX_ITERATIONS:
            needs_human_review = True
            quality_status = "rejected_after_max_iterations"

    reason = (
        "质检通过，证据链、矩阵完整性和风险水位满足进入策略生成要求。"
        if quality_result.approved
        else quality_result.reject_reason or "部分质量检查未通过"
    )
    quality_result_dict = _quality_result_with_legacy_fields(quality_result, reason)

    next_state = {
        **state,
        "current_agent": "QualityAgent",
        "quality_result": quality_result_dict,
        "is_approved": quality_result.approved,
        "iteration_count": next_iteration_count,
        "rejected_agents": rejected_agents,
        "needs_human_review": needs_human_review,
        "quality_status": quality_status,
    }
    _append_trace(next_state, quality_result)

    print(
        f"[QualityAgent] 质检完成：{quality_result_dict.get('status')}，"
        f"得分 {quality_result_dict.get('quality_score')}"
    )
    return next_state


def quality_router(state: dict) -> str:
    """Route approved states to strategy_agent, rejected states to a repair node."""
    quality_result = state.get("quality_result", {})
    iteration_count = int(state.get("iteration_count", 0) or 0)

    if state.get("needs_human_review") or (
        not quality_result.get("approved")
        and quality_result.get("status") == "rejected"
        and iteration_count >= MAX_ITERATIONS
    ):
        return "human_review"

    if (
        state.get("is_approved")
        or quality_result.get("approved")
        or quality_result.get("status") == "approved"
    ):
        return "strategy_agent"

    reject_to = quality_result.get("reject_to") or quality_result.get("target_agent")
    return ROUTER_MAP.get(reject_to, "evidence_agent")
