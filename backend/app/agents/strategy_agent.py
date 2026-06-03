"""Strategy Agent - generate a cited final report from validated claims."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List

from app.schemas.report import StrategyAgentOutput
from app.services.metrics_service import calculate_report_metrics


SWOT_KEYS = ("strengths", "weaknesses", "opportunities", "threats")


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value)


def _coerce_score(value: Any, fallback: float = 3.0) -> float:
    if isinstance(value, (int, float)):
        score = float(value)
    else:
        try:
            score = float(_as_text(value))
        except ValueError:
            score = fallback
    return max(1.0, min(5.0, score))


def _claim_confidence(claim: Dict[str, Any]) -> float:
    value = claim.get("confidence_score")
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))
    return 0.7


def _valid_claims(
    claims: List[Dict[str, Any]],
    existing_evidence_ids: set[str],
    excluded_claim_ids: set[str] | None = None,
) -> List[Dict[str, Any]]:
    excluded_claim_ids = excluded_claim_ids or set()
    valid_claims: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for claim in claims:
        if not isinstance(claim, dict):
            continue
        claim_id = _as_text(claim.get("claim_id"))
        if not claim_id or claim_id in seen or claim_id in excluded_claim_ids:
            continue
        evidence_ids = [
            _as_text(evidence_id)
            for evidence_id in claim.get("evidence_ids", [])
            if _as_text(evidence_id) in existing_evidence_ids
        ]
        if not evidence_ids:
            continue
        normalized = dict(claim)
        normalized["evidence_ids"] = list(dict.fromkeys(evidence_ids))
        valid_claims.append(normalized)
        seen.add(claim_id)
    return valid_claims


def _matrix_cells(matrix: Any) -> Iterable[tuple[str, str, Dict[str, Any]]]:
    if not isinstance(matrix, dict):
        return
    dimensions = matrix.get("dimensions", {})
    if not isinstance(dimensions, dict):
        return
    for dimension, platform_map in dimensions.items():
        if not isinstance(platform_map, dict):
            continue
        for platform, cell in platform_map.items():
            yield _as_text(platform), _as_text(dimension), cell if isinstance(cell, dict) else {}


def _platform_scores(
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
    existing_evidence_ids: set[str],
) -> Dict[str, Dict[str, Any]]:
    scores: Dict[str, Dict[str, Any]] = {}

    for platform, dimension, cell in [
        *list(_matrix_cells(product_matrix)),
        *list(_matrix_cells(business_matrix)),
    ]:
        if not platform:
            continue
        data = scores.setdefault(
            platform,
            {"scores": [], "evidence_ids": [], "strong_dimensions": [], "weak_dimensions": []},
        )
        score = _coerce_score(cell.get("score"), 3.0)
        data["scores"].append(score)
        if score >= 4:
            data["strong_dimensions"].append(dimension)
        if score <= 3:
            data["weak_dimensions"].append(dimension)

        for evidence_id in cell.get("evidence_ids", []) or []:
            evidence_id = _as_text(evidence_id)
            if evidence_id in existing_evidence_ids and evidence_id not in data["evidence_ids"]:
                data["evidence_ids"].append(evidence_id)

    return scores


def _ranking(
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
    valid_claims: List[Dict[str, Any]],
    existing_evidence_ids: set[str],
) -> List[Dict[str, Any]]:
    platform_scores = _platform_scores(product_matrix, business_matrix, existing_evidence_ids)

    for claim in valid_claims:
        for platform in claim.get("related_platforms", []) or []:
            platform = _as_text(platform)
            if not platform:
                continue
            data = platform_scores.setdefault(
                platform,
                {"scores": [], "evidence_ids": [], "strong_dimensions": [], "weak_dimensions": []},
            )
            data["scores"].append(_claim_confidence(claim) * 5)
            if claim.get("dimension"):
                data["strong_dimensions"].append(_as_text(claim.get("dimension")))
            for evidence_id in claim.get("evidence_ids", []):
                if evidence_id in existing_evidence_ids and evidence_id not in data["evidence_ids"]:
                    data["evidence_ids"].append(evidence_id)

    ranking: List[Dict[str, Any]] = []
    for platform, data in platform_scores.items():
        raw_scores = data["scores"]
        avg_score = sum(raw_scores) / len(raw_scores) if raw_scores else 3.0
        score = round(avg_score * 2, 1)
        evidence_ids = data["evidence_ids"][:3]
        strong = list(dict.fromkeys(data["strong_dimensions"]))[:2]
        weak = list(dict.fromkeys(data["weak_dimensions"]))[:2]

        if evidence_ids:
            if strong:
                summary = f"{platform}优势主要集中在{'、'.join(strong)}，建议继续放大可验证差异化（证据：{'、'.join(evidence_ids)}）"
            elif weak:
                summary = f"{platform}短板主要集中在{'、'.join(weak)}，需要优先补齐能力和证据链（证据：{'、'.join(evidence_ids)}）"
            else:
                summary = f"{platform}综合表现接近均衡，当前判断基于已有矩阵与 claims（证据：{'、'.join(evidence_ids)}）"
        else:
            summary = f"{platform}缺少可引用 evidence_id，当前排名仅能标记为 evidence_gap。"

        ranking.append(
            {
                "platform": platform,
                "score": score,
                "rank": 0,
                "summary": summary,
                "supporting_evidence_ids": evidence_ids,
            }
        )

    ranking.sort(key=lambda item: item["score"], reverse=True)
    for index, item in enumerate(ranking, start=1):
        item["rank"] = index
    return ranking


def _recommendations(valid_claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    used_claim_ids: set[str] = set()

    for claim in sorted(valid_claims, key=_claim_confidence, reverse=True):
        claim_id = _as_text(claim.get("claim_id"))
        evidence_ids = claim.get("evidence_ids", [])
        if not claim_id or not evidence_ids or claim_id in used_claim_ids:
            continue

        dimension = _as_text(claim.get("dimension")) or "核心维度"
        content = _as_text(claim.get("content"))
        recommendation = (
            f"围绕{dimension}优先推进可验证改进，并以当前 claim 作为跟踪基线："
            f"{content[:80]}（证据：{'、'.join(evidence_ids[:3])}）"
        )
        recommendations.append(
            {
                "recommendation": recommendation,
                "supporting_claim_ids": [claim_id],
                "supporting_evidence_ids": evidence_ids[:3],
                "confidence_score": round(_claim_confidence(claim), 2),
            }
        )
        used_claim_ids.add(claim_id)
        if len(recommendations) >= 5:
            break

    return recommendations


def _swot(
    ranking: List[Dict[str, Any]],
    valid_claims: List[Dict[str, Any]],
    risk_flags: List[Dict[str, Any]],
) -> Dict[str, List[str]]:
    top_platform = ranking[0]["platform"] if ranking else "领先平台"
    top_evidence_ids = ranking[0].get("supporting_evidence_ids", []) if ranking else []
    top_evidence = f"（证据：{'、'.join(top_evidence_ids[:2])}）" if top_evidence_ids else ""

    strengths = [
        f"{top_platform}在综合矩阵中处于领先位置，具备可继续放大的竞争基础{top_evidence}",
    ]
    weaknesses: List[str] = []

    for claim in valid_claims[:2]:
        evidence_ids = claim.get("evidence_ids", [])[:2]
        evidence = f"（证据：{'、'.join(evidence_ids)}）" if evidence_ids else ""
        strengths.append(f"{_as_text(claim.get('dimension')) or '核心维度'}已有 claim 支撑，可沉淀为管理层跟踪指标{evidence}")

    high_risks = [
        risk
        for risk in risk_flags
        if isinstance(risk, dict) and _as_text(risk.get("severity")).lower() == "high"
    ]
    if high_risks:
        weaknesses.append(f"仍存在 high severity 风险，需要先处理后再扩大决策使用范围：{_as_text(high_risks[0].get('description'))}")
    else:
        weaknesses.append("当前风险水位未触发 high severity，但仍需保留证据复核机制。")

    return {
        "strengths": strengths[:3],
        "weaknesses": weaknesses[:3],
        "opportunities": [
            "把高置信 claims 转化为可持续跟踪的产品与商业指标。",
            "围绕证据更充分的维度优先设计短周期验证实验。",
            "将矩阵评分和 evidence_id 绑定，形成可追溯的竞品复盘节奏。",
        ],
        "threats": [
            "证据缺口可能导致部分维度判断滞后或低置信。",
            "竞品定价、渠道和产品迭代可能改变当前排名。",
            "低可信来源若进入核心结论，会放大策略误判风险。",
        ],
    }


def _risk_disclosure(risk_flags: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    severity_order = {"high": 0, "medium": 1, "low": 2}
    disclosures = []
    for risk in risk_flags:
        if not isinstance(risk, dict):
            continue
        disclosures.append(
            {
                "risk_type": risk.get("risk_type"),
                "severity": risk.get("severity"),
                "description": risk.get("description"),
                "related_platforms": risk.get("related_platforms", []),
                "related_dimensions": risk.get("related_dimensions", []),
                "related_evidence_ids": risk.get("related_evidence_ids", []),
            }
        )
    disclosures.sort(key=lambda item: severity_order.get(_as_text(item.get("severity")), 3))
    return disclosures


def _used_ids(
    recommendations: List[Dict[str, Any]],
    ranking: List[Dict[str, Any]],
    valid_claims: List[Dict[str, Any]],
    existing_claim_ids: set[str],
    existing_evidence_ids: set[str],
) -> tuple[List[str], List[str]]:
    used_claim_ids: List[str] = []
    used_evidence_ids: List[str] = []

    for recommendation in recommendations:
        for claim_id in recommendation.get("supporting_claim_ids", []):
            if claim_id in existing_claim_ids and claim_id not in used_claim_ids:
                used_claim_ids.append(claim_id)
        for evidence_id in recommendation.get("supporting_evidence_ids", []):
            if evidence_id in existing_evidence_ids and evidence_id not in used_evidence_ids:
                used_evidence_ids.append(evidence_id)

    for item in ranking:
        for evidence_id in item.get("supporting_evidence_ids", []):
            if evidence_id in existing_evidence_ids and evidence_id not in used_evidence_ids:
                used_evidence_ids.append(evidence_id)

    if not used_claim_ids and valid_claims:
        claim_id = _as_text(valid_claims[0].get("claim_id"))
        if claim_id in existing_claim_ids:
            used_claim_ids.append(claim_id)
    if not used_evidence_ids and valid_claims:
        for evidence_id in valid_claims[0].get("evidence_ids", []):
            if evidence_id in existing_evidence_ids and evidence_id not in used_evidence_ids:
                used_evidence_ids.append(evidence_id)

    return used_claim_ids, used_evidence_ids


def _draft_report(
    claims: List[Dict[str, Any]],
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
    risk_flags: List[Dict[str, Any]],
    quality_result: Dict[str, Any],
    metrics: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "quality_status": "requires_human_review",
        "needs_human_review": True,
        "auto_approved": False,
        "executive_summary": [
            "当前分析未通过自动质量检查。",
            "本报告仅作为低置信草稿，不建议直接用于正式业务决策。",
            "请根据 required_actions 补充证据后重新运行。",
        ],
        "competitive_ranking": [],
        "competitor_ranking": [],
        "swot_analysis": {key: [] for key in SWOT_KEYS},
        "swot": {key: [] for key in SWOT_KEYS},
        "strategic_recommendations": [],
        "risk_disclosure": _risk_disclosure(risk_flags),
        "quality_result": quality_result,
        "risk_flags": risk_flags,
        "used_claim_ids": [],
        "used_evidence_ids": [],
        "metrics": metrics,
        "draft_product_matrix": product_matrix,
        "draft_business_matrix": business_matrix,
        "draft_claims": claims,
        "required_actions": quality_result.get("required_actions", []),
        "missing_dimensions": quality_result.get("missing_dimensions", []),
        "missing_platforms": quality_result.get("missing_platforms", []),
        "data_confidence": "requires_human_review：当前分析未通过自动质量检查，不生成正式战略结论。",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _formal_report(
    valid_claims: List[Dict[str, Any]],
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
    risk_flags: List[Dict[str, Any]],
    quality_result: Dict[str, Any],
    evidence_list: List[Dict[str, Any]],
    metrics: Dict[str, Any],
    existing_evidence_ids: set[str],
) -> tuple[Dict[str, Any], List[str], List[str]]:
    ranking = _ranking(product_matrix, business_matrix, valid_claims, existing_evidence_ids)
    recommendations = _recommendations(valid_claims)
    if not recommendations:
        recommendations = []

    existing_claim_ids = {_as_text(claim.get("claim_id")) for claim in valid_claims}
    used_claim_ids, used_evidence_ids = _used_ids(
        recommendations=recommendations,
        ranking=ranking,
        valid_claims=valid_claims,
        existing_claim_ids=existing_claim_ids,
        existing_evidence_ids=existing_evidence_ids,
    )
    swot = _swot(ranking, valid_claims, risk_flags)
    risk_disclosure = _risk_disclosure(risk_flags)

    quality_score = quality_result.get("quality_score", quality_result.get("score", 0))
    top_platform = ranking[0]["platform"] if ranking else "暂无明确领先平台"
    top_evidence_ids = ranking[0].get("supporting_evidence_ids", []) if ranking else []
    top_evidence = f"（证据：{'、'.join(top_evidence_ids[:2])}）" if top_evidence_ids else ""
    executive_summary = (
        f"本次报告基于 {len(valid_claims)} 条结构化 claims 和 {len(evidence_list)} 条 evidence 生成，"
        f"当前综合排名第一为 {top_platform}{top_evidence}。"
        f"质检状态为 approved，得分 {quality_score}；所有战略建议均绑定已有 claim_id 和 evidence_id。"
    )

    if not recommendations:
        executive_summary += "当前缺少可同时绑定 claim_id 与 evidence_id 的建议，需标记 insufficient_evidence。"

    final_report = {
        "quality_status": "approved",
        "needs_human_review": False,
        "executive_summary": executive_summary,
        "competitor_ranking": ranking,
        "competitive_ranking": ranking,
        "swot": swot,
        "swot_analysis": swot,
        "strategic_recommendations": recommendations,
        "recommendations": recommendations,
        "risk_disclosure": risk_disclosure,
        "risks": risk_disclosure,
        "product_matrix": product_matrix,
        "business_matrix": business_matrix,
        "metrics": metrics,
        "quality_result": quality_result,
        "used_claim_ids": used_claim_ids,
        "used_evidence_ids": used_evidence_ids,
        "data_confidence": (
            f"整体数据置信度基于质检得分 {quality_score}、"
            f"{len(used_claim_ids)} 条已引用 claims 和 {len(used_evidence_ids)} 条已引用 evidence 评估。"
        ),
        "evidence_count": len(evidence_list),
        "claim_count": len(valid_claims),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
    return final_report, used_claim_ids, used_evidence_ids


def _append_trace(
    state: dict,
    used_claim_ids: List[str],
    used_evidence_ids: List[str],
) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "StrategyAgent",
            "status": "success",
            "output_summary": (
                f"generated final_report using {len(used_claim_ids)} claims "
                f"and {len(used_evidence_ids)} evidence items"
            ),
            "error": None,
        }
    )


def strategy_agent(state: dict) -> Dict[str, Any]:
    """Generate a final report without creating new evidence or claims."""
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
    quality_result = state.get("quality_result", {})
    evidence_list = [
        item for item in state.get("evidence_list", [])
        if isinstance(item, dict)
    ]
    metrics = calculate_report_metrics(state)
    needs_human_review = bool(state.get("needs_human_review", False))
    faithfulness_report = state.get("faithfulness_report", {})
    if not isinstance(faithfulness_report, dict):
        faithfulness_report = {}
    unsupported_claim_ids = {
        _as_text(item) for item in state.get("unsupported_claim_ids", []) if _as_text(item)
    }

    existing_evidence_ids = {
        _as_text(evidence.get("evidence_id"))
        for evidence in evidence_list
        if evidence.get("evidence_id")
    }
    # Exclude claims flagged as unfaithful so hallucinated conclusions never reach the report.
    valid_claims = _valid_claims(claims, existing_evidence_ids, unsupported_claim_ids)

    is_rejected = (
        needs_human_review
        or quality_result.get("approved") is False
        or quality_result.get("status") == "rejected"
    )

    if is_rejected:
        final_report = _draft_report(
            claims=claims,
            product_matrix=product_matrix if isinstance(product_matrix, dict) else {},
            business_matrix=business_matrix if isinstance(business_matrix, dict) else {},
            risk_flags=risk_flags,
            quality_result=quality_result if isinstance(quality_result, dict) else {},
            metrics=metrics,
        )
        used_claim_ids: List[str] = []
        used_evidence_ids: List[str] = []
    else:
        final_report, used_claim_ids, used_evidence_ids = _formal_report(
            valid_claims=valid_claims,
            product_matrix=product_matrix if isinstance(product_matrix, dict) else {},
            business_matrix=business_matrix if isinstance(business_matrix, dict) else {},
            risk_flags=risk_flags,
            quality_result=quality_result if isinstance(quality_result, dict) else {},
            evidence_list=evidence_list,
            metrics=metrics,
            existing_evidence_ids=existing_evidence_ids,
        )

    if isinstance(final_report, dict):
        final_report["faithfulness_report"] = faithfulness_report

    output = StrategyAgentOutput(
        final_report=final_report,
        used_claim_ids=used_claim_ids,
        used_evidence_ids=used_evidence_ids,
    )

    next_state = {
        **state,
        "current_agent": "StrategyAgent",
        "final_report": output.final_report,
        "used_claim_ids": output.used_claim_ids,
        "used_evidence_ids": output.used_evidence_ids,
        "metrics": metrics,
    }
    _append_trace(next_state, output.used_claim_ids, output.used_evidence_ids)

    print(
        f"[StrategyAgent] 最终报告生成完成，"
        f"排名平台数 {len(final_report.get('competitive_ranking', []))}"
    )
    return next_state
