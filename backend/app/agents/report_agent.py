"""Report Agent for the gaming-mouse professional schema.

This node is the only final-report writer in the public DAG. It does not invent
new evidence or product facts. It assembles the verified state into
GamingMouseFinalReportSchema and explicitly preserves pending MCP gaps.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from app.schemas.report import ReportAgentOutput
from app.services.metrics_service import calculate_report_metrics


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _valid_claims(state: dict, evidence_ids: set[str]) -> List[Dict[str, Any]]:
    unsupported = {_as_text(item) for item in state.get("unsupported_claim_ids", []) if _as_text(item)}
    claims = [item for item in state.get("claims", []) if isinstance(item, dict)]
    valid: List[Dict[str, Any]] = []
    for claim in claims:
        claim_id = _as_text(claim.get("claim_id"))
        if claim_id and claim_id in unsupported:
            continue
        cited = [_as_text(item) for item in claim.get("evidence_ids", []) if _as_text(item)]
        if cited and all(item in evidence_ids for item in cited):
            valid.append(claim)
    return valid


def _used_ids(valid_claims: List[Dict[str, Any]], evidence_ids: set[str]) -> tuple[List[str], List[str]]:
    used_claim_ids: List[str] = []
    used_evidence_ids: List[str] = []
    for claim in valid_claims:
        claim_id = _as_text(claim.get("claim_id"))
        if claim_id:
            used_claim_ids.append(claim_id)
        for evidence_id in claim.get("evidence_ids", []):
            evidence_id = _as_text(evidence_id)
            if evidence_id and evidence_id in evidence_ids and evidence_id not in used_evidence_ids:
                used_evidence_ids.append(evidence_id)
    return used_claim_ids, used_evidence_ids


def _product_label(product: Dict[str, Any]) -> str:
    brand = _as_text(product.get("brand"))
    model = _as_text(product.get("model"))
    return f"{brand} {model}".strip() or _as_text(product.get("product_id")) or "待识别产品"


def _score_products(state: dict) -> List[Dict[str, Any]]:
    scores = state.get("product_scores", {})
    if not isinstance(scores, dict):
        return []
    return [item for item in scores.get("products", []) if isinstance(item, dict)]


def _string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [_as_text(item) for item in value if _as_text(item)]


def _clean_identity(item: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {
        "official_model": _as_text(item.get("official_model") or item.get("model")),
        "model": _as_text(item.get("model") or item.get("official_model")),
        "brand": _as_text(item.get("brand")),
        "family": _as_text(item.get("family")),
        "variant_name": _as_text(item.get("variant_name")),
        "variant_type": _as_text(item.get("variant_type")),
        "aliases": _string_list(item.get("aliases")),
        "community_aliases": _string_list(item.get("community_aliases")),
        "alias_confidence": _as_text(item.get("alias_confidence")) or "pending",
        "official_name_confidence": _as_text(item.get("official_name_confidence")) or "pending",
        "shape_detail": _as_text(item.get("shape_detail")),
        "click_system": _as_text(item.get("click_system")),
        "data_status": _as_text(item.get("data_status")) or "pending",
        "field_confidence": item.get("field_confidence") if isinstance(item.get("field_confidence"), dict) else {},
        "official_fields": _string_list(item.get("official_fields")),
        "review_verified_fields": _string_list(item.get("review_verified_fields")),
        "rule_inferred_fields": _string_list(item.get("rule_inferred_fields")),
        "community_unverified_fields": _string_list(item.get("community_unverified_fields")),
        "pending": item.get("pending") if isinstance(item.get("pending"), list) else _as_text(item.get("pending")),
    }
    if not cleaned["official_model"]:
        cleaned["official_model"] = cleaned["model"] or "待识别产品"
    if not cleaned["model"]:
        cleaned["model"] = cleaned["official_model"]
    return cleaned


def _identification(state: dict) -> List[Dict[str, Any]]:
    scores = state.get("product_scores", {})
    if isinstance(scores, dict):
        identities = [item for item in scores.get("identification", []) if isinstance(item, dict)]
        if identities:
            return [_clean_identity(item) for item in identities]

    identities: List[Dict[str, Any]] = []
    for item in state.get("resolved_products", []):
        if not isinstance(item, dict):
            continue
        identities.append(
            {
                "official_model": item.get("official_model") or item.get("model"),
                "model": item.get("official_model") or item.get("model"),
                "brand": item.get("official_brand") or item.get("brand"),
                "family": item.get("family") or "",
                "variant_name": item.get("variant_name") or "",
                "variant_type": item.get("variant_type") or "",
                "alias_confidence": item.get("match_confidence") or "pending",
                "click_system": item.get("click_system") or "",
                "data_status": "resolved",
            }
        )
    return [_clean_identity(item) for item in identities]


def _hardware_specs(state: dict) -> List[Dict[str, Any]]:
    specs: List[Dict[str, Any]] = []
    for fact in state.get("product_facts", []):
        if not isinstance(fact, dict):
            continue
        fact_specs = fact.get("specs") if isinstance(fact.get("specs"), dict) else {}
        specs.append(
            {
                "product_id": fact.get("product_id"),
                "brand": fact.get("brand"),
                "model": fact.get("model"),
                "data_status": fact.get("data_status") or fact_specs.get("data_status") or "verified",
                "fact_source": fact.get("fact_source") or "local_product_json",
                "weight_g": fact_specs.get("weight_g"),
                "sensor": fact_specs.get("sensor") or "",
                "dpi_max": fact_specs.get("dpi_max"),
                "polling_rate_hz": fact_specs.get("polling_rate_hz"),
                "connection": fact_specs.get("connection") or [],
                "battery_hours": fact_specs.get("battery_hours"),
                "switch_type": fact_specs.get("switch_type") or "",
                "click_system": fact_specs.get("click_system") or "",
                "software": fact_specs.get("software") or "",
                "onboard_memory": fact_specs.get("onboard_memory"),
                "shape": fact_specs.get("shape") or "",
                "price_range": {
                    **(fact_specs.get("price_range") if isinstance(fact_specs.get("price_range"), dict) else {}),
                    "status": "reference_only",
                    "note": "历史参考价格不参与最终性价比判断，实时价格等待 Price MCP 补齐。",
                },
                "field_confidence": fact_specs.get("field_confidence") or {},
                "sources": fact_specs.get("sources") or [],
            }
        )
    return specs


def _feature_tree(state: dict, hardware_specs: List[Dict[str, Any]]) -> Dict[str, Any]:
    has_hardware = bool(hardware_specs)
    source = "local_product_json" if has_hardware else "pending_official_spec_mcp"
    hardware_status = "available" if has_hardware else "pending"
    return {
        "schema_name": "gaming_mouse_feature_tree",
        "performance": {
            "name": "性能参数",
            "status": hardware_status,
            "summary": "传感器、DPI 与回报率来自本地事实库或后续官网 MCP。",
            "source": source,
            "fields": ["sensor", "dpi_max", "polling_rate_hz"],
        },
        "shape_and_weight": {
            "name": "轻量化与形态事实",
            "status": hardware_status,
            "summary": "重量与形态只作为稳定硬件事实展示；尺寸、模具 ID、握法和手感等待用户评价/测评证据。",
            "source": source,
            "fields": ["weight_g", "shape"],
        },
        "wireless_and_battery": {
            "name": "无线与续航",
            "status": hardware_status,
            "summary": "连接方式、回报率与续航以稳定规格为准；实测体验等待评测数据。",
            "source": source,
            "fields": ["connection", "battery_hours", "polling_rate_hz"],
        },
        "click_system": {
            "name": "点击系统",
            "status": hardware_status,
            "summary": "点击系统和微动类型可进入硬件对比，长期可靠性等待用户反馈验证。",
            "source": source,
            "fields": ["switch_type", "click_system"],
        },
        "software_ecosystem": {
            "name": "软件/驱动生态",
            "status": "partial" if has_hardware else "pending",
            "summary": "当前只展示驱动名称和板载内存事实，驱动稳定性等待 ReviewIntel MCP。",
            "source": source,
            "fields": ["software", "onboard_memory"],
        },
    }


def _pricing_model(state: dict) -> Dict[str, Any]:
    price_status = state.get("price_status", {}) if isinstance(state.get("price_status"), dict) else {}
    return {
        "schema_name": "gaming_mouse_pricing_model",
        "status": "pending",
        "realtime_price_status": price_status.get("status") or "mcp_not_connected",
        "price_range_reference": [],
        "value_score_status": "pending",
        "note": "价格会随时间变化，最终性价比等待 PriceAgent/MCP 实时采集。",
    }


def _user_persona(state: dict) -> Dict[str, Any]:
    review_status = state.get("review_intel_status", {}) if isinstance(state.get("review_intel_status"), dict) else {}
    return {
        "schema_name": "gaming_mouse_user_persona",
        "status": "insufficient_evidence",
        "grip_style_fit": {},
        "hand_size_fit": {},
        "game_type_fit": {},
        "target_persona": [],
        "evidence_status": review_status.get("status") or "review_intel_pending",
        "limitation": "握法、手型、适合游戏和长期口碑必须等待真实评价/测评证据。",
    }


def _score_flow(state: dict) -> Dict[str, Any]:
    flow = state.get("score_flow", {}) if isinstance(state.get("score_flow"), dict) else {}
    if flow.get("baseline_score") or flow.get("final_score"):
        return flow

    products = flow.get("products", []) if isinstance(flow.get("products"), list) else []
    best = None
    best_score = None
    for item in products:
        if not isinstance(item, dict):
            continue
        score = item.get("final_score")
        if isinstance(score, (int, float)) and (best_score is None or score > best_score):
            best_score = score
            best = item.get("model") or item.get("product_id")

    return {
        "baseline_score": {
            "label": "本地硬件事实",
            "score": best_score,
            "source": "local_product_json",
            "description": "只基于稳定硬件参数，不包含用户口碑或实时价格。",
        },
        "agent_adjustments": [
            {
                "agent": "AnalysisAgent",
                "dimension": "hardware_facts",
                "adjustment": 0,
                "status": "applied",
                "reason": "硬件事实已进入结构化对比。",
            },
            {
                "agent": "CollectorAgent",
                "dimension": "review_price_mcp",
                "adjustment": 0,
                "status": "pending",
                "reason": "评价、博主测评和实时价格 MCP 尚未接入。",
            },
            {
                "agent": "QualityAgent",
                "dimension": "report_credibility",
                "adjustment": 0,
                "status": "applied",
                "reason": "质量分表示报告可信度，不等于产品好坏。",
            },
        ],
        "final_score": {
            "label": "Agent 最终综合建议",
            "score": best_score,
            "recommended_product": best or "待定",
            "description": "MCP 维度 pending 时不做口碑或性价比修正。",
        },
        "products": products,
    }


def _final_recommendation(state: dict, score_flow: Dict[str, Any]) -> Dict[str, Any]:
    final_score = score_flow.get("final_score", {}) if isinstance(score_flow.get("final_score"), dict) else {}
    recommended = _as_text(final_score.get("recommended_product"))
    if not recommended or recommended == "待定":
        return {
            "recommended_product": "待定",
            "reason": "当前缺少完整产品事实或证据链，不输出确定购买建议。",
            "top_reasons": ["本地事实不足或外部数据仍为 pending。"],
            "cautions": ["等待搜索、官网规格、评价测评和实时价格 MCP 补齐。"],
        }

    return {
        "recommended_product": recommended,
        "reason": "当前建议只基于已验证的硬件事实、证据链、风险披露和质量门控。",
        "top_reasons": [
            "本地硬件事实已结构化进入对比。",
            "所有正式 claim 必须引用有效 evidence_id。",
            "pending 的评价、测评和实时价格已披露，不伪造成已完成。",
        ],
        "cautions": [
            "握法、手型、适合游戏和长期可靠性等待真实用户/测评证据。",
            "实时价格未接入前，不输出最终性价比结论。",
        ],
    }


def _agent_contributions(state: dict) -> List[Dict[str, Any]]:
    defaults = [
        ("ResearchAgent", "调研规划员", "规划本地事实、官网规格、评价测评和实时价格的数据需求。"),
        ("CollectorAgent", "采集与实体识别员", "识别产品、读取本地事实库，并把外部 MCP 数据标记为 pending。"),
        ("EvidenceAgent", "证据结构化员", "把本地事实和采集结果统一转换成可追溯 evidence。"),
        ("AnalysisAgent", "分析师", "只分析有 evidence 支撑的硬件事实差异，并披露体验/价格缺口。"),
        ("VerificationAgent", "事实校验员", "检查 claim 和矩阵结论是否被 evidence 支撑。"),
        ("QualityAgent", "质量门控员", "根据证据、风险和 pending 数据决定 approved、limited 或 partial_report。"),
        ("ReportAgent", "报告撰写员", "汇总专业电竞鼠标 schema 报告。"),
    ]
    trace_agents = {
        item.get("agent_name"): item.get("status")
        for item in state.get("trace_log", [])
        if isinstance(item, dict)
    }
    return [
        {
            "agent": agent,
            "role": role,
            "summary": summary,
            "status": trace_agents.get(agent, "not_run"),
        }
        for agent, role, summary in defaults
    ]


def _evidence_links(
    state: dict,
    used_claim_ids: List[str],
    used_evidence_ids: List[str],
    risk_flags: List[Dict[str, Any]],
) -> Dict[str, Any]:
    quality_result = state.get("quality_result", {}) if isinstance(state.get("quality_result"), dict) else {}
    return {
        "used_claim_ids": used_claim_ids,
        "used_evidence_ids": used_evidence_ids,
        "evidence_status": state.get("evidence_status", {}),
        "unsupported_claim_ids": state.get("unsupported_claim_ids", []),
        "pending_data": quality_result.get("pending_data") or state.get("pending_data", []),
        "risk_flags": risk_flags,
    }


def _append_trace(state: dict, used_claim_ids: List[str], used_evidence_ids: List[str]) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "ReportAgent",
            "status": "success",
            "output_summary": (
                f"generated gaming_mouse final_report with {len(used_claim_ids)} claims "
                f"and {len(used_evidence_ids)} evidence items"
            ),
            "error": None,
        }
    )


def report_agent(state: dict) -> Dict[str, Any]:
    """Generate the final professional report."""
    evidence_list = [item for item in state.get("evidence_list", []) if isinstance(item, dict)]
    evidence_ids = {_as_text(item.get("evidence_id")) for item in evidence_list if _as_text(item.get("evidence_id"))}
    valid_claims = _valid_claims(state, evidence_ids)
    used_claim_ids, used_evidence_ids = _used_ids(valid_claims, evidence_ids)

    quality_result = state.get("quality_result", {}) if isinstance(state.get("quality_result"), dict) else {}
    quality_status = _as_text(quality_result.get("status") or state.get("quality_status") or "pending")
    risk_flags = [item for item in state.get("risk_flags", []) if isinstance(item, dict)]
    hardware_specs = _hardware_specs(state)
    score_flow = _score_flow(state)
    metrics = calculate_report_metrics(state)
    pending_data = quality_result.get("pending_data") or state.get("pending_data", [])

    final_report = {
        "schema_name": "gaming_mouse_competitive_report",
        "schema_version": "1.0",
        "report_kind": "gaming_mouse_product_comparison",
        "report_type": "agent_final_report",
        "title": "电竞鼠标 Agent 综合分析报告",
        "summary": {
            "status": quality_status,
            "evidence_count": len(evidence_list),
            "claim_count": len(valid_claims),
            "pending_count": len(pending_data) if isinstance(pending_data, list) else 0,
            "schema": "GamingMouseFinalReportSchema",
        },
        "executive_summary": [
            f"本次报告使用 {len(valid_claims)} 条已验证 claims 和 {len(evidence_list)} 条 evidence。",
            "本地硬件事实可直接进入对比，评价测评、实时价格和长期口碑仍等待 MCP 补齐。",
            f"QualityAgent 状态为 {quality_status}，quality_score 是报告可信度，不是产品评分。",
        ],
        "product_identification": _identification(state),
        "hardware_specs": hardware_specs,
        "official_spec_records": state.get("official_spec_records", []),
        "hardware_fact_comparison": state.get("hardware_analysis", {}),
        "product_matrix": state.get("product_matrix", {}),
        "business_matrix": state.get("business_matrix", {}),
        "feature_tree": _feature_tree(state, hardware_specs),
        "pricing_model": _pricing_model(state),
        "user_persona": _user_persona(state),
        "evidence_links": _evidence_links(state, used_claim_ids, used_evidence_ids, risk_flags),
        "score_flow": score_flow,
        "agent_contributions": _agent_contributions(state),
        "pending_data": pending_data,
        "risk_disclosure": risk_flags,
        "risk_flags": risk_flags,
        "quality_status": quality_status,
        "report_status": quality_status,
        "approved_with_limitations": quality_status == "approved_with_limitations",
        "partial_report": quality_status == "partial_report",
        "auto_degraded": bool(quality_result.get("auto_degraded")),
        "limitations": quality_result.get("limitations", []),
        "final_recommendation": _final_recommendation(state, score_flow),
        "final_score": [
            {
                "product_id": item.get("product_id"),
                "product": _product_label(item),
                "score": item.get("overall_score", {}).get("current_score")
                if isinstance(item.get("overall_score"), dict)
                else None,
                "score_type": "hardware_fact_baseline",
            }
            for item in _score_products(state)
        ],
        "used_claim_ids": used_claim_ids,
        "used_evidence_ids": used_evidence_ids,
        "metrics": metrics,
        "faithfulness_report": state.get("faithfulness_report", {}),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }

    output = ReportAgentOutput(
        final_report=final_report,
        used_claim_ids=used_claim_ids,
        used_evidence_ids=used_evidence_ids,
    )
    final_report_payload = output.final_report.model_dump(mode="json")
    next_state = {
        **state,
        "current_agent": "ReportAgent",
        "final_report": final_report_payload,
        "used_claim_ids": output.used_claim_ids,
        "used_evidence_ids": output.used_evidence_ids,
        "metrics": metrics,
    }
    _append_trace(next_state, output.used_claim_ids, output.used_evidence_ids)
    print(
        f"[ReportAgent] 专业报告生成完成，claims={len(output.used_claim_ids)}, "
        f"evidence={len(output.used_evidence_ids)}"
    )
    return next_state
