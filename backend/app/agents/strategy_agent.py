"""Strategy Agent - generate a cited final report from validated claims."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List

from app.schemas.report import StrategyAgentOutput
from app.services.metrics_service import calculate_report_metrics


SWOT_KEYS = ("strengths", "weaknesses", "opportunities", "threats")


def _product_verdict_lines(verdicts: Dict[str, Any]) -> List[str]:
    """把产品评分裁决转成报告里展示的产品导向结论（区别于报告质量分）。"""
    if not isinstance(verdicts, dict) or not verdicts:
        return []
    lines = [
        f"基础硬件快评更强：{verdicts.get('strongest_overall') or '暂无'}（仅基于硬件/官方事实/点击系统）。",
        f"硬件更强：{verdicts.get('strongest_hardware') or '暂无'}。",
        f"驱动支持基础判断更好：{verdicts.get('best_software') or '暂无'}。",
        f"点击系统更优：{verdicts.get('best_click_system') or '暂无'}。",
    ]
    for note in verdicts.get("pending_verification", []) or []:
        lines.append(f"待验证：{note}")
    return lines


def _score_value(score: Dict[str, Any], path: str, default: float | None = None) -> float | None:
    current: Any = score
    for part in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(part)
    return current if isinstance(current, (int, float)) else default


def _product_label(score: Dict[str, Any]) -> str:
    brand = _as_text(score.get("brand"))
    model = _as_text(score.get("model"))
    return f"{brand} {model}".strip() or model or "未知产品"


def _agent_contributions() -> List[Dict[str, Any]]:
    """Explain what each agent contributes to the final purchase advice."""
    return [
        {
            "agent": "ResearchAgent",
            "role": "产品事实收集",
            "summary": "读取本地产品事实库，确认官方型号、变体、模具与字段来源。",
            "contribution": "读取本地产品事实库，确认官方型号、变体、模具与字段来源；未来接入爬虫后补官网、评测和实时价格。",
            "key_findings": ["本地硬件规格已可用", "官网/评测/实时价格爬虫暂未接入"],
            "confidence": "high",
            "status": "applied",
            "evidence_source": "local_product_catalog",
        },
        {
            "agent": "EvidenceAgent",
            "role": "证据结构化",
            "summary": "把产品规格、来源和字段可信度整理成结构化 evidence。",
            "contribution": "把产品规格、来源和字段可信度整理成结构化 evidence，供后续 Agent 引用。",
            "key_findings": ["硬件维度已有 evidence", "用户口碑与价格维度被标为 pending"],
            "confidence": "high",
            "status": "applied",
            "evidence_source": "structured_evidence",
        },
        {
            "agent": "ProductAgent",
            "role": "硬件与适配评分",
            "summary": "生成基础硬件快评、模具识别和点击系统判断；体验适配等待爬虫。",
            "contribution": "生成基础硬件快评、模具识别和点击系统判断；握法、手型、适合游戏类型不再由本地 JSON 推断。",
            "key_findings": ["基础硬件快评已生成", "点击系统和模具进入快评", "握法/手型/游戏适配等待真实反馈"],
            "confidence": "high",
            "status": "applied",
            "evidence_source": "local_product_catalog",
        },
        {
            "agent": "BusinessAgent",
            "role": "商业维度处理",
            "summary": "产品对比模式下不强行生成商业矩阵，避免把品牌商业分析混入鼠标购买建议。",
            "contribution": "产品对比模式下跳过商业矩阵，不参与最终产品分，只保留兼容工作流的质量门控判断。",
            "key_findings": ["产品对比更关注硬件/软件/口碑", "商业矩阵当前不作为最终购买建议核心"],
            "confidence": "medium",
            "status": "skipped_in_product_compare",
            "evidence_source": "workflow_policy",
        },
        {
            "agent": "CrawlerReviewAgent",
            "role": "用户反馈与测评分析",
            "summary": "真实爬虫暂未接入，当前只标记用户评价、博主测评和实时价格为待补充。",
            "contribution": "真实爬虫暂未接入，因此不伪造用户评价、博主测评或实时价格，只把这些维度作为 pending 修正项。",
            "key_findings": ["用户评价待爬取", "博主测评待爬取", "实时价格待爬取"],
            "confidence": "pending",
            "status": "pending_not_executed",
            "evidence_source": "pending_crawler",
        },
        {
            "agent": "VerificationAgent",
            "role": "结论忠实性检查",
            "summary": "检查产品结论是否绑定已有 evidence。",
            "contribution": "检查产品结论是否绑定已有 evidence，避免无证据的购买建议进入报告。",
            "key_findings": ["最终报告只使用已有 claim/evidence", "未支撑结论不会进入正式报告"],
            "confidence": "high",
            "status": "applied",
            "evidence_source": "faithfulness_check",
        },
        {
            "agent": "RiskAgent",
            "role": "风险提示",
            "summary": "标记网友评价、博主测评、实时价格和长期可靠性等待补齐风险。",
            "contribution": "标记网友评价、博主测评、实时价格和长期可靠性等待爬虫补齐的风险项。",
            "key_findings": ["口碑证据缺失是主要不确定性", "创新点击系统需要长期反馈验证"],
            "confidence": "medium",
            "status": "applied",
            "evidence_source": "risk_flags",
        },
        {
            "agent": "QualityAgent",
            "role": "报告质量门控",
            "summary": "检查报告证据覆盖、引用完整度和风险严重度。",
            "contribution": "检查报告证据覆盖、引用完整度和风险严重度，输出报告可信度。",
            "key_findings": ["报告可信度是质量分，不是产品分", "质量门控通过后才生成正式报告"],
            "confidence": "high",
            "status": "applied",
            "evidence_source": "quality_gate",
        },
        {
            "agent": "StrategyAgent",
            "role": "最终综合建议",
            "summary": "整合基础快评、证据链和风险项，形成最终购买建议。",
            "contribution": "整合基础快评、证据链和风险项，形成最终购买建议。",
            "key_findings": ["输出推荐产品", "说明适合人群、适合游戏和待验证风险"],
            "confidence": "medium",
            "status": "applied",
            "evidence_source": "agent_reasoning",
        },
    ]


def _build_baseline_hardware_review(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    products = [
        {
            "product_id": score.get("product_id"),
            "product": _product_label(score),
            "baseline_score": _score_value(score, "overall_score.current_score"),
            "conservative_placeholder_score": _score_value(
                score,
                "overall_score.full_score_with_missing_as_zero",
            ),
            "hardware_score": score.get("hardware_score"),
            "software_score": score.get("software_score"),
            "click_system_score": score.get("click_system_score"),
            "data_completeness": score.get("data_completeness"),
        }
        for score in product_scores.get("products", [])
        if isinstance(score, dict)
    ]
    return {
        "source": "local_product_json",
        "score_type": "baseline_hardware_quick_review",
        "label": "基础硬件快评",
        "not_final": True,
        "description": "基于本地 JSON 事实库的即时硬件判断，不代表最终综合购买建议。",
        "products": products,
        "pending_dimensions": [
            "网友评价 / 博主测评",
            "握法 / 手型 / 适合游戏类型",
            "驱动长期稳定性",
            "实时价格",
            "长期可靠性",
        ],
        "price_note": "price_range 仅作为参考价 / 历史参考区间展示，不参与当前核心评分；实时价格待爬虫接入。",
    }


def _build_score_transition(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    products = [
        {
            "product_id": score.get("product_id"),
            "product": _product_label(score),
            "baseline_score": _score_value(score, "overall_score.current_score"),
            "agent_final_score": _score_value(score, "overall_score.current_score"),
            "score_delta": 0,
            "delta_reason": "当前未接入实时爬虫，Agent 暂未用口碑/实时价格修正分数；最终建议主要由证据链和风险项约束。",
        }
        for score in product_scores.get("products", [])
        if isinstance(score, dict)
    ]
    return {
        "baseline": {
            "label": "基础硬件快评",
            "source": "local_product_json",
            "description": "基于本地 JSON 的即时硬件判断，只用于快速了解硬件、模具和点击系统差异。",
            "products": products,
        },
        "agent_adjustments": [
            {
                "dimension": "用户评价 / 博主测评",
                "status": "pending",
                "effect": "暂未修正最终推荐；接入爬虫后用于口碑、握法、手型和游戏场景修正。",
            },
            {
                "dimension": "实时价格",
                "status": "pending",
                "effect": "暂不参与性价比判断；当前 price_range 仅作参考价展示。",
            },
            {
                "dimension": "驱动长期稳定性",
                "status": "pending",
                "effect": "当前只基于官方软件生态和板载存储评分，后续由用户反馈/评测补齐。",
            },
            {
                "dimension": "长期可靠性",
                "status": "pending",
                "effect": "对创新点击系统保留风险提示，等待长期口碑验证。",
            },
        ],
        "final": {
            "label": "Agent 最终建议",
            "description": "由 StrategyAgent 基于基础硬件快评、证据链、风险项和质量检查生成；待爬虫维度接入后会重新修正。",
            "products": products,
        },
    }


def _build_agent_analysis_result(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    products = [
        score for score in product_scores.get("products", []) if isinstance(score, dict)
    ]
    verdicts = product_scores.get("verdicts", {}) if isinstance(product_scores.get("verdicts"), dict) else {}
    recommended = verdicts.get("strongest_overall") or (products[0].get("model") if products else "暂无")

    top_reasons = [
        f"基础硬件快评领先：{recommended}。",
        f"硬件维度更强：{verdicts.get('strongest_hardware') or '暂无'}。",
        f"点击系统更优：{verdicts.get('best_click_system') or '暂无'}。",
    ]

    cautions = [
        "握法、手型和适合游戏类型不再由本地 JSON 推断，等待真实用户评价和博主测评验证。",
        "网友评价 / 博主测评尚未接入实时爬虫，口碑结论需要后续验证。",
        "实时价格未接入，当前不做性价比最终判断。",
    ]
    for score in products:
        click = score.get("click_system", {}) if isinstance(score.get("click_system"), dict) else {}
        risk = _as_text(click.get("risk"))
        if risk and "验证" in risk:
            cautions.append(f"{score.get('model')}：{risk}")

    persona_recommendations = [
        {
            "persona": "握法 / 手型适配",
            "recommended_product": "待爬虫验证",
            "reason": "趴握、抓握、指握、小手/中手/大手适配需要真实用户评价、博主测评或长期体验反馈，当前不从本地 JSON 下结论。",
            "evidence_basis": ["pending_crawler_reviews", "pending_blogger_reviews"],
        }
    ]

    game_recommendations = [
        {
            "game_type": "适合游戏类型",
            "recommended_product": "待爬虫验证",
            "reason": "战术 FPS、追踪 FPS、MOBA 等场景适配需要结合玩家反馈和测评描述，当前基础快评只展示硬件参数。",
        }
    ]

    product_strengths_and_risks = []
    for score in products:
        click = score.get("click_system", {}) if isinstance(score.get("click_system"), dict) else {}
        strengths = [
            f"硬件快评分 {score.get('hardware_score')}，基础分 {_score_value(score, 'overall_score.current_score')}。",
            f"点击系统：{click.get('pros', '暂无说明')}。",
        ]
        risks = [
            "握法 / 手型 / 适合游戏类型待真实用户反馈验证。",
            "实时价格待爬虫接入，当前不做性价比最终判断。",
            "网友评价 / 博主测评待采集。",
        ]
        click_risk = _as_text(click.get("risk"))
        if click_risk:
            risks.append(click_risk)
        product_strengths_and_risks.append(
            {
                "product": _product_label(score),
                "strengths": strengths,
                "risks": risks,
                "pending_validation": ["用户口碑", "博主测评", "实时价格", "长期可靠性"],
            }
        )

    return {
        "agent_final_verdict": {
            "recommended_product": recommended,
            "recommendation_level": "conditional",
            "summary": (
                f"当前 Agent 建议优先关注 {recommended}；该建议基于本地硬件事实、"
                "结构化 evidence、风险检查和报告质检生成，待爬虫口碑与实时价格接入后可再修正。"
            ),
            "top_reasons": top_reasons,
            "cautions": list(dict.fromkeys(cautions)),
        },
        "persona_recommendations": persona_recommendations,
        "game_recommendations": game_recommendations,
        "product_strengths_and_risks": product_strengths_and_risks,
        "agent_contributions": _agent_contributions(),
    }


def _product_score_items(product_scores: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        score for score in product_scores.get("products", []) if isinstance(score, dict)
    ]


def _verdicts(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    verdicts = product_scores.get("verdicts", {})
    return verdicts if isinstance(verdicts, dict) else {}


def _find_product_score(product_scores: Dict[str, Any], product_name: str) -> Dict[str, Any]:
    products = _product_score_items(product_scores)
    product_name = _as_text(product_name).lower()
    if not products:
        return {}
    for product in products:
        model = _as_text(product.get("model")).lower()
        label = _product_label(product).lower()
        if product_name and (product_name == model or product_name in label):
            return product
    return products[0]


def _current_score(score: Dict[str, Any]) -> float | None:
    return _score_value(score, "overall_score.current_score")


def _build_report_title(product_scores: Dict[str, Any]) -> str:
    products = [_product_label(score) for score in _product_score_items(product_scores)]
    if len(products) >= 2:
        return f"{products[0]} vs {products[1]} Agent 综合分析报告"
    if products:
        return f"{products[0]} Agent 综合分析报告"
    return "电竞外设 Agent 综合分析报告"


def _build_report_summary(
    product_scores: Dict[str, Any],
    quality_result: Dict[str, Any],
) -> Dict[str, Any]:
    verdicts = _verdicts(product_scores)
    recommended = _as_text(verdicts.get("strongest_overall")) or (
        _product_score_items(product_scores)[0].get("model")
        if _product_score_items(product_scores)
        else "暂无明确推荐"
    )
    recommended_score = _current_score(_find_product_score(product_scores, recommended))
    reason_parts = [
        f"{recommended} 在当前基础硬件快评中综合更强",
        f"硬件领先：{verdicts.get('strongest_hardware') or '暂无'}",
        f"点击系统领先：{verdicts.get('best_click_system') or '暂无'}",
    ]
    quality_score = quality_result.get("quality_score", quality_result.get("score"))
    return {
        "winner": recommended,
        "recommendation": f"优先关注 {recommended}",
        "reason": "；".join([part for part in reason_parts if part]),
        "confidence": quality_score if isinstance(quality_score, (int, float)) else None,
        "score": recommended_score,
        "data_mode": "local_catalog_with_pending_crawler",
        "data_note": "当前结论基于本地产品事实库与 Agent 质量门控；用户口碑、博主测评和实时价格等待爬虫补充。",
    }


def _build_score_flow(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    verdicts = _verdicts(product_scores)
    recommended = _as_text(verdicts.get("strongest_overall")) or "暂无明确推荐"
    products = [
        {
            "product_id": score.get("product_id"),
            "product": _product_label(score),
            "baseline_score": _current_score(score),
            "agent_final_score": _current_score(score),
            "score_delta": 0,
            "source": "local_product_catalog",
            "note": "当前尚未接入真实爬虫，因此 Agent 不用口碑、博主测评或实时价格修正数值。",
        }
        for score in _product_score_items(product_scores)
    ]
    recommended_score = _current_score(_find_product_score(product_scores, recommended))

    return {
        "baseline_score": {
            "label": "基础硬件快评",
            "score": recommended_score,
            "source": "local_product_catalog",
            "description": "仅基于本地产品事实库的硬件/规格/模具/点击系统与驱动支持事实快评，不代表最终综合评价。",
            "products": products,
        },
        "agent_adjustments": [
            {
                "agent": "ProductAgent",
                "dimension": "硬件参数 / 模具 / 重量 / 传感器 / 点击系统",
                "adjustment": 0,
                "status": "applied",
                "reason": "基础硬件差异已进入快评分；当前未额外改变数值，只影响最终推荐解释。",
                "evidence_source": "local_product_catalog",
            },
            {
                "agent": "CrawlerReviewAgent",
                "dimension": "用户口碑 / 博主测评",
                "adjustment": 0,
                "status": "pending",
                "reason": "真实爬虫暂未接入，不能伪造用户评价或博主测评。",
                "evidence_source": "pending_crawler",
            },
            {
                "agent": "CrawlerPriceAgent",
                "dimension": "实时价格 / 性价比",
                "adjustment": 0,
                "status": "pending",
                "reason": "价格会随时间变化，当前只显示历史参考价，后续由实时爬虫修正。",
                "evidence_source": "pending_crawler",
            },
            {
                "agent": "RiskAgent",
                "dimension": "长期可靠性 / 字段不确定性",
                "adjustment": 0,
                "status": "applied",
                "reason": "创新点击系统、社区未确认别名和待验证字段只进入风险提示，不伪造成确定口碑。",
                "evidence_source": "risk_flags",
            },
            {
                "agent": "QualityAgent",
                "dimension": "证据完整性 / 可信度",
                "adjustment": 0,
                "status": "applied",
                "reason": "质量评分用于报告可信度，不直接等同于产品最终分。",
                "evidence_source": "quality_gate",
            },
        ],
        "final_score": {
            "label": "Agent 最终综合评分",
            "score": recommended_score,
            "recommended_product": recommended,
            "description": "结合硬件事实、Agent 推理、证据完整性与待补充风险后的综合建议分；爬虫接入后会根据口碑和实时价格重新修正。",
            "products": products,
        },
    }


def _build_fit_analysis(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    verdicts = _verdicts(product_scores)
    recommended = _as_text(verdicts.get("strongest_overall")) or "暂无明确推荐"

    return {
        "best_for": [
            f"{recommended}：当前只代表基础硬件事实更占优，不代表握法/手型/游戏场景最终适配。",
        ],
        "not_ideal_for": [
            "需要明确趴握/抓握/指握结论的玩家：该维度等待真实用户反馈和测评爬虫。",
            "需要判断小手/中手/大手适配的玩家：该维度等待真实用户反馈和测评爬虫。",
            "需要判断战术 FPS / 追踪 FPS / MOBA 适配的玩家：该维度等待真实用户反馈和测评爬虫。",
            "强依赖实时低价或促销价的玩家：价格后续应由爬虫实时更新。",
        ],
        "game_type_fit": {
            "fps": "待爬虫验证：需要玩家反馈和博主测评。",
            "moba": "待爬虫验证：需要玩家反馈和博主测评。",
            "general": "待爬虫验证：当前只展示硬件事实差异。",
        },
        "hand_grip_fit": {
            "palm": "待爬虫验证",
            "claw": "待爬虫验证",
            "fingertip": "待爬虫验证",
            "small_hand": "待爬虫验证",
            "medium_hand": "待爬虫验证",
            "large_hand": "待爬虫验证",
        },
    }


def _build_evidence_status(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    identifications = product_scores.get("identification", [])
    products = identifications if isinstance(identifications, list) else []
    return {
        "local_catalog": {
            "status": "available",
            "summary": "本地产品事实库已提供硬件规格、模具、重量、连接方式、驱动软件名称、点击系统与字段来源可信度；握法/手型/游戏适配不写入本地事实库。",
            "products": [
                {
                    "product": f"{item.get('brand', '')} {item.get('model', '')}".strip(),
                    "official_fields": item.get("official_fields", []),
                    "review_verified_fields": item.get("review_verified_fields", []),
                    "rule_inferred_fields": item.get("rule_inferred_fields", []),
                    "community_unverified_fields": item.get("community_unverified_fields", []),
                }
                for item in products
                if isinstance(item, dict)
            ],
        },
        "crawler_reviews": {
            "status": "pending",
            "summary": "用户评价、电商评论、Bilibili/YouTube 博主测评暂未接入，当前报告不会伪造口碑结论。",
        },
        "crawler_price": {
            "status": "pending",
            "summary": "实时价格不应长期写死，当前 price_range 只作为历史参考价展示，后续由爬虫动态补充。",
        },
        "field_confidence_note": {
            "status": "available",
            "summary": "official / review_verified / rule_inferred / community_unverified 会在产品识别区展示，未确认社区叫法只作为风险提示。",
        },
    }


def _build_final_recommendation(product_scores: Dict[str, Any]) -> Dict[str, Any]:
    verdicts = _verdicts(product_scores)
    recommended = _as_text(verdicts.get("strongest_overall")) or "暂无明确推荐"
    return {
        "recommended_product": recommended,
        "short_reason": f"{recommended} 在当前硬件事实和点击系统下综合更值得优先关注。",
        "buying_advice": "如果现在必须二选一，可以先按本报告的硬件参数差异做初筛；如果握法、手型、游戏场景、价格、售后、用户口碑很重要，建议等待爬虫补齐后再做最终购买判断。",
        "risk_notes": [
            "握法、手型和适合游戏类型尚未接入真实用户反馈。",
            "用户口碑、博主测评和实时价格尚未接入。",
            "创新点击系统的长期可靠性需要真实用户反馈验证。",
            "社区别名或玩家圈叫法若未官方确认，应以官方型号为准。",
        ],
        "fit_highlights": ["握法 / 手型 / 适合游戏类型：待爬虫验证"],
    }


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
        # 产品评分（基于硬件 JSON）随报告输出，并明确与报告可信度分离。
        product_scores = state.get("product_scores", {})
        if isinstance(product_scores, dict) and product_scores.get("products"):
            score_flow = _build_score_flow(product_scores)
            agent_analysis_result = _build_agent_analysis_result(product_scores)
            final_report["product_scores"] = product_scores
            final_report["baseline_hardware_review"] = _build_baseline_hardware_review(product_scores)
            final_report["score_transition"] = _build_score_transition(product_scores)
            final_report["agent_analysis_result"] = agent_analysis_result
            final_report["report_kind"] = "gaming_mouse_product_comparison"
            final_report["report_type"] = "agent_final_report"
            final_report["title"] = _build_report_title(product_scores)
            final_report["summary"] = _build_report_summary(
                product_scores,
                quality_result if isinstance(quality_result, dict) else {},
            )
            final_report["score_flow"] = score_flow
            final_report["agent_contributions"] = _agent_contributions()
            final_report["fit_analysis"] = _build_fit_analysis(product_scores)
            final_report["evidence_status"] = _build_evidence_status(product_scores)
            final_report["final_recommendation"] = _build_final_recommendation(product_scores)
            final_report["product_verdict_summary"] = _product_verdict_lines(
                product_scores.get("verdicts", {})
            )
            # 产品识别与变体说明（官方型号 / 系列 / 模具 / 点击系统 / 字段可信度 / 待验证体验维度）
            final_report["product_identification"] = product_scores.get("identification", [])
            final_report["score_legend"] = (
                "quality_score 表示报告可信度/分析质量，不代表产品好坏；"
                "产品对比页展示的是基础硬件快评；Agent 最终建议请看 agent_analysis_result 和 score_transition。"
            )

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
