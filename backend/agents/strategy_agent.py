"""Strategy Agent - generate the final competitive strategy report."""

from __future__ import annotations

import ast
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from .industry_config import get_state_dimensions, get_state_industry_name
from .state import CompetitiveAnalysisState


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
SWOT_KEYS = ("strengths", "weaknesses", "opportunities", "threats")


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("STRATEGY_AGENT_USE_LLM", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def get_llm() -> ChatOpenAI:
    """Create the Doubao Ark-compatible chat model."""
    _load_env()
    return ChatOpenAI(
        model=os.getenv("ARK_EP", ""),
        api_key=os.getenv("ARK_API_KEY", ""),
        base_url=BASE_URL,
        temperature=0.2,
        timeout=60,
        max_retries=0,
    )


def _response_to_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or item))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    fence_match = re.fullmatch(r"```(?:json|JSON)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return cleaned


def _balanced_json_candidates(text: str) -> Iterable[str]:
    for start, char in enumerate(text):
        if char not in "[{":
            continue

        stack = [char]
        in_string = False
        escape = False

        for index in range(start + 1, len(text)):
            current = text[index]
            if in_string:
                if escape:
                    escape = False
                elif current == "\\":
                    escape = True
                elif current == '"':
                    in_string = False
                continue

            if current == '"':
                in_string = True
            elif current in "[{":
                stack.append(current)
            elif current in "]}":
                if not stack:
                    break
                opening = stack[-1]
                if (opening, current) not in (("[", "]"), ("{", "}")):
                    break
                stack.pop()
                if not stack:
                    yield text[start : index + 1]
                    break


def _json_candidates(text: str) -> Iterable[str]:
    cleaned = _strip_json_fence(text)
    yield cleaned

    for block in re.findall(r"```(?:json|JSON)?\s*(.*?)\s*```", text, re.DOTALL):
        yield block.strip()

    yield from _balanced_json_candidates(text)


def _try_parse_json(candidate: str) -> Any:
    normalized = candidate.strip().lstrip("\ufeff")
    normalized = re.sub(r",\s*([}\]])", r"\1", normalized)
    try:
        return json.loads(normalized)
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(normalized)
        except (SyntaxError, ValueError):
            return None


def _parse_response(text: str) -> Any:
    """Parse unstable LLM JSON from raw text, markdown fences, or nested blocks."""
    for candidate in _json_candidates(text):
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed
    return None


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False)


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_as_text(item) for item in value if _as_text(item)]
    text = _as_text(value)
    return [text] if text else []


def _coerce_score(value: Any, fallback: float = 6.0) -> float:
    if isinstance(value, (int, float)):
        score = float(value)
    else:
        match = re.search(r"\d+(?:\.\d+)?", _as_text(value))
        score = float(match.group()) if match else fallback
    return round(max(1.0, min(10.0, score)), 1)


def _coerce_quality_score(value: Any, fallback: int = 0) -> int:
    if isinstance(value, (int, float)):
        score = int(round(value))
    else:
        match = re.search(r"\d+", _as_text(value))
        score = int(match.group()) if match else fallback
    return max(0, min(100, score))


def _get_platforms(state: CompetitiveAnalysisState) -> List[str]:
    platforms: List[str] = []
    for platform in [state.get("target_platform", ""), *state.get("competitors", [])]:
        if platform and platform not in platforms:
            platforms.append(platform)

    for matrix_name in ("product_matrix", "business_matrix"):
        matrix = state.get(matrix_name, {})
        dimensions = matrix.get("dimensions", {}) if isinstance(matrix, dict) else {}
        if not isinstance(dimensions, dict):
            continue
        for platform_map in dimensions.values():
            if not isinstance(platform_map, dict):
                continue
            for platform in platform_map.keys():
                platform_text = _as_text(platform)
                if platform_text and platform_text not in platforms:
                    platforms.append(platform_text)
    return platforms


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


def _platform_scores(state: CompetitiveAnalysisState) -> Dict[str, Dict[str, Any]]:
    scores: Dict[str, Dict[str, Any]] = {
        platform: {"scores": [], "strong_dimensions": [], "weak_dimensions": []}
        for platform in _get_platforms(state)
    }

    for matrix_name in ("product_matrix", "business_matrix"):
        for platform, dimension, cell in _matrix_cells(state.get(matrix_name, {})):
            if platform not in scores:
                scores[platform] = {"scores": [], "strong_dimensions": [], "weak_dimensions": []}
            raw_score = cell.get("score") if isinstance(cell, dict) else 3
            score_1_to_5 = max(1, min(5, int(round(float(raw_score))) if isinstance(raw_score, (int, float)) else 3))
            scores[platform]["scores"].append(score_1_to_5)
            if score_1_to_5 >= 4:
                scores[platform]["strong_dimensions"].append(dimension)
            if score_1_to_5 <= 3:
                scores[platform]["weak_dimensions"].append(dimension)
    return scores


def _fallback_ranking(state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    platform_scores = _platform_scores(state)
    ranking = []

    for platform, data in platform_scores.items():
        raw_scores = data["scores"]
        avg_score = sum(raw_scores) / len(raw_scores) if raw_scores else 3.0
        score = round(avg_score * 2, 1)
        strong = list(dict.fromkeys(data["strong_dimensions"]))[:2]
        weak = list(dict.fromkeys(data["weak_dimensions"]))[:2]
        if strong:
            summary = f"优势集中在{', '.join(strong)}，需要继续放大差异化。"
        elif weak:
            summary = f"当前短板集中在{', '.join(weak)}，竞争力仍需补强。"
        else:
            summary = "现有矩阵证据有限，综合竞争力按中性水平评估。"
        ranking.append({"platform": platform, "score": score, "rank": 0, "summary": summary})

    ranking.sort(key=lambda item: item["score"], reverse=True)
    for index, item in enumerate(ranking, start=1):
        item["rank"] = index
    return ranking


def _target_dimension_summary(state: CompetitiveAnalysisState) -> Dict[str, List[str]]:
    target = state.get("target_platform", "")
    data = _platform_scores(state).get(target, {"strong_dimensions": [], "weak_dimensions": []})
    return {
        "strong": list(dict.fromkeys(data.get("strong_dimensions", []))),
        "weak": list(dict.fromkeys(data.get("weak_dimensions", []))),
    }


def _ensure_count(items: List[str], defaults: List[str], count: int = 3) -> List[str]:
    result = [item for item in items if item]
    for item in defaults:
        if item not in result:
            result.append(item)
        if len(result) >= count:
            break
    return result[:count]


def _fallback_swot(state: CompetitiveAnalysisState) -> Dict[str, List[str]]:
    target = state.get("target_platform", "目标平台")
    industry_name = get_state_industry_name(state)
    dimensions = get_state_dimensions(state)
    dimension_focus = "、".join(dimensions[:2]) if dimensions else "核心竞争维度"
    summary = _target_dimension_summary(state)
    strong = summary["strong"]
    weak = summary["weak"]
    quality_status = state.get("quality_result", {}).get("status", "approved")

    strengths = [f"{target}在{dimension}上具备相对优势。" for dimension in strong[:3]]
    weaknesses = [f"{target}在{dimension}上仍需补齐能力和证据支撑。" for dimension in weak[:3]]

    if quality_status == "rejected":
        weaknesses.append("当前分析仍存在质检打回项，部分结论需要补证后再确认。")

    return {
        "strengths": _ensure_count(
            strengths,
            [
                f"{target}在{industry_name}赛道具备一定品牌认知和渠道基础。",
                f"{target}可围绕{dimension_focus}沉淀差异化竞争资产。",
                f"{target}已有产品线和用户反馈可用于持续优化。",
            ],
        ),
        "weaknesses": _ensure_count(
            weaknesses,
            [
                "部分维度缺少直接证据引用，分析置信度有提升空间。",
                "产品体验、渠道表现和生态协同仍需更多公开信息验证。",
                "定价、定位和产品组合需要更清晰的差异化抓手。",
            ],
        ),
        "opportunities": _ensure_count(
            [
                f"围绕{dimension_focus}打造更清晰的目标人群定位。",
                "通过产品组合、软件生态和用户反馈闭环提升复购与口碑。",
                "在渠道、配件、服务和生态兼容场景中拓展增量需求。",
            ],
            [
                "探索跨品类组合和场景化套装带来的联动增长。",
                "利用供应链、渠道和服务合作降低产品波动。",
            ],
        ),
        "threats": _ensure_count(
            [
                "头部品牌在技术迭代、渠道覆盖和用户心智上持续形成压力。",
                "关键零部件、成本和渠道政策变化可能压缩利润空间。",
                "同质化产品和价格促销可能削弱品牌溢价。",
            ],
            [
                "竞品价格促销可能削弱用户留存和品牌溢价。",
                "低可信数据可能导致策略判断偏差。",
            ],
        ),
    }


def _fallback_opportunities(state: CompetitiveAnalysisState) -> List[str]:
    target = state.get("target_platform", "目标平台")
    industry_name = get_state_industry_name(state)
    dimensions = get_state_dimensions(state)
    dimension_focus = "、".join(dimensions[:2]) if dimensions else "核心维度"
    return [
        f"{target}可围绕{dimension_focus}建立更清晰的{industry_name}差异化定位。",
        "以核心产品体验为中心，把硬件、软件、服务和渠道反馈串成连续优化链路。",
        "强化目标人群洞察，对新品定位、价格带和场景化卖点做精细化运营。",
        "补齐证据薄弱维度的公开数据和用户反馈，提升高频用户满意度。",
    ]


def _fallback_recommendations(state: CompetitiveAnalysisState) -> List[str]:
    target = state.get("target_platform", "目标平台")
    industry_name = get_state_industry_name(state)
    quality_result = state.get("quality_result", {})
    recommendations = [
        f"{target}应优先建立{industry_name}核心维度的证据化指标看板，用于持续跟踪竞品变化。",
        "围绕高分维度放大差异化定位，同时对低分维度设立专项补强计划。",
        "将官网、评测、报告和用户口碑等来源分层管理，提升战略判断的可追溯性。",
    ]
    if quality_result.get("status") == "rejected":
        recommendations.append(f"先处理质检打回项：{quality_result.get('required_fix', '补齐证据链后再更新最终判断。')}")
    else:
        recommendations.append("在质检通过的证据范围内推进试点，并保留滚动复核机制。")
    return recommendations[:5]


def _fallback_confidence(state: CompetitiveAnalysisState) -> str:
    quality_result = state.get("quality_result", {})
    evidence_count = len(state.get("evidence_list", []))
    quality_score = quality_result.get("quality_score", 0)
    status = quality_result.get("status", "unknown")

    if status == "approved" and quality_score >= 80:
        level = "较高"
    elif quality_score >= 60:
        level = "中等"
    else:
        level = "偏低"
    return f"整体数据置信度为{level}：共引用 {evidence_count} 条证据，质检得分 {quality_score}，质检状态为 {status}。"


def _fallback_report(state: CompetitiveAnalysisState) -> Dict[str, Any]:
    target = state.get("target_platform", "目标平台")
    industry_name = get_state_industry_name(state)
    ranking = _fallback_ranking(state)
    evidence_count = len(state.get("evidence_list", []))
    quality_score = int(state.get("quality_result", {}).get("quality_score", 0) or 0)
    top_platform = ranking[0]["platform"] if ranking else target
    target_rank = next((item["rank"] for item in ranking if item["platform"] == target), "待确认")

    executive_summary = (
        f"本次竞品分析围绕{industry_name}赛道中{target}及主要竞品的产品与商业矩阵展开。"
        f"当前综合排名第一为{top_platform}，{target}排名为{target_rank}。"
        f"报告基于{evidence_count}条证据和质检得分{quality_score}生成，建议优先补强证据薄弱维度并推进产品、价格和用户口碑联动。"
    )[:200]

    return {
        "executive_summary": executive_summary,
        "competitive_ranking": ranking,
        "swot_analysis": _fallback_swot(state),
        "opportunities": _fallback_opportunities(state)[:5],
        "strategic_recommendations": _fallback_recommendations(state)[:5],
        "data_confidence": _fallback_confidence(state),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "quality_score": quality_score,
        "evidence_count": evidence_count,
    }


def _build_prompt(state: CompetitiveAnalysisState, fallback_report: Dict[str, Any]) -> str:
    example_platform = state.get("target_platform") or "目标品牌"
    payload = {
        "industry_key": state.get("industry_key", ""),
        "industry_name": get_state_industry_name(state),
        "focus_dimensions": get_state_dimensions(state),
        "target_platform": state.get("target_platform", ""),
        "competitors": state.get("competitors", []),
        "analysis_scene": state.get("analysis_scene", ""),
        "target_user": state.get("target_user", ""),
        "product_matrix": state.get("product_matrix", {}),
        "business_matrix": state.get("business_matrix", {}),
        "evidence_list": state.get("evidence_list", []),
        "quality_result": state.get("quality_result", {}),
        "fallback_report": fallback_report,
    }
    return f"""
你是 StrategyAgent，负责生成结构化竞品战略分析报告。

请只输出 JSON 对象，不要输出 Markdown 或解释文字。格式必须为：
{{
  "executive_summary": "执行摘要，200字以内",
  "competitive_ranking": [
    {{"platform": "{example_platform}", "score": 8.5, "rank": 1, "summary": "说明（证据：EV001）"}}
  ],
  "swot_analysis": {{
    "strengths": ["优势1（证据：EV001）", "优势2（证据：EV002）", "优势3（证据：EV003）"],
    "weaknesses": ["劣势1（证据：EV004）", "劣势2（证据：EV005）", "劣势3（证据：EV006）"],
    "opportunities": ["机会1", "机会2", "机会3"],
    "threats": ["威胁1", "威胁2", "威胁3"]
  }},
  "opportunities": ["机会点1", "机会点2", "机会点3"],
  "strategic_recommendations": ["建议内容（证据：EV001、EV003）", "建议内容（证据：EV002）", "建议内容（证据：EV004）"],
  "data_confidence": "整体数据置信度说明",
  "generated_at": "时间戳",
  "quality_score": 76,
  "evidence_count": 8
}}

规则：
- StrategyAgent 不能凭空生成新结论，所有结论必须基于输入数据中的 evidence_list、product_matrix、business_matrix、quality_result。
- competitive_ranking 的 score 为 1-10 分，rank 从 1 开始。
- SWOT 是目标平台的 SWOT，每个字段至少 3 条。
- opportunities 和 strategic_recommendations 各 3-5 条。
- 如果 quality_result 为 rejected，必须在 data_confidence 和建议中说明证据限制。

证据引用规则（必须严格遵守）：
1. competitive_ranking 里每个平台的 summary 必须在末尾引用至少1个证据，格式：（证据：EV001）
2. strategic_recommendations 里每条建议必须在末尾引用至少1个证据，格式：（证据：EV001、EV003）
3. swot_analysis 的 strengths 和 weaknesses 每条尽量引用1个证据
4. 只能引用 evidence_list 里真实存在的 evidence_id，不能编造
5. 如果证据不足，在 data_confidence 里说明限制，不要补造事实。

输入数据：
{json.dumps(payload, ensure_ascii=False)}
""".strip()


def _extract_report_payload(payload: Any) -> Dict[str, Any]:
    if payload is None:
        return {}
    if isinstance(payload, str):
        return _extract_report_payload(_parse_response(payload))
    if isinstance(payload, dict):
        for key in ("final_report", "report", "data", "result"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                return nested
        return payload
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                return item
    return {}


def _normalize_ranking(value: Any, fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return fallback

    ranking = []
    for item in value:
        if not isinstance(item, dict):
            continue
        platform = _as_text(item.get("platform") or item.get("name"))
        if not platform:
            continue
        ranking.append(
            {
                "platform": platform,
                "score": _coerce_score(item.get("score"), 6.0),
                "rank": int(item.get("rank")) if isinstance(item.get("rank"), int) else 0,
                "summary": _as_text(item.get("summary") or item.get("reason")) or "综合产品与商业表现给出该评分。",
            }
        )

    if not ranking:
        return fallback

    ranking.sort(key=lambda item: (item["rank"] if item["rank"] else 999, -item["score"]))
    ranking.sort(key=lambda item: item["score"], reverse=True)
    for index, item in enumerate(ranking, start=1):
        item["rank"] = index
    return ranking


def _normalize_swot(value: Any, fallback: Dict[str, List[str]]) -> Dict[str, List[str]]:
    if not isinstance(value, dict):
        return fallback

    normalized = {}
    for key in SWOT_KEYS:
        normalized[key] = _ensure_count(_as_list(value.get(key)), fallback.get(key, []), 3)
    return normalized


def _normalize_limited_list(value: Any, fallback: List[str], minimum: int = 3, maximum: int = 5) -> List[str]:
    items = _as_list(value)
    for item in fallback:
        if item not in items:
            items.append(item)
        if len(items) >= minimum:
            break
    return items[:maximum]


def _normalize_report(payload: Any, fallback: Dict[str, Any]) -> Dict[str, Any]:
    item = _extract_report_payload(payload)
    if not item:
        return fallback

    report = {
        "executive_summary": (_as_text(item.get("executive_summary") or item.get("executiveSummary")) or fallback["executive_summary"])[:200],
        "competitive_ranking": _normalize_ranking(item.get("competitive_ranking") or item.get("competitiveRanking"), fallback["competitive_ranking"]),
        "swot_analysis": _normalize_swot(item.get("swot_analysis") or item.get("swotAnalysis"), fallback["swot_analysis"]),
        "opportunities": _normalize_limited_list(item.get("opportunities"), fallback["opportunities"]),
        "strategic_recommendations": _normalize_limited_list(
            item.get("strategic_recommendations") or item.get("strategicRecommendations"),
            fallback["strategic_recommendations"],
        ),
        "data_confidence": _as_text(item.get("data_confidence") or item.get("dataConfidence")) or fallback["data_confidence"],
        "generated_at": _as_text(item.get("generated_at") or item.get("generatedAt")) or fallback["generated_at"],
        "quality_score": _coerce_quality_score(
            item.get("quality_score") or item.get("qualityScore"),
            fallback["quality_score"],
        ),
        "evidence_count": int(item.get("evidence_count"))
        if isinstance(item.get("evidence_count"), int)
        else fallback["evidence_count"],
    }
    return report


def _generate_with_llm(
    llm: ChatOpenAI | None,
    state: CompetitiveAnalysisState,
    fallback_report: Dict[str, Any],
) -> Any:
    if llm is None:
        return None
    response = llm.invoke(_build_prompt(state, fallback_report))
    return _parse_response(_response_to_text(response))


def strategy_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """Generate the final structured competitive strategy report."""
    _load_env()
    error_log = list(state.get("error_log", []))
    fallback = _fallback_report(state)

    llm: ChatOpenAI | None = None
    if not _llm_enabled():
        error_log.append("StrategyAgent 已按 STRATEGY_AGENT_USE_LLM 配置跳过 LLM 调用，使用兜底战略报告。")
    elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = get_llm()
        except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
            error_log.append(f"StrategyAgent 初始化 LLM 失败：{exc}")
    else:
        error_log.append("StrategyAgent 未找到 ARK_EP 或 ARK_API_KEY，已启用兜底战略报告。")

    try:
        llm_payload = _generate_with_llm(llm, state, fallback)
        final_report = _normalize_report(llm_payload, fallback)
    except Exception as exc:
        error_log.append(f"StrategyAgent 生成最终报告失败：{exc}")
        final_report = fallback

    print(
        f"[StrategyAgent] 最终报告生成完成，"
        f"排名平台数 {len(final_report.get('competitive_ranking', []))}"
    )
    return {
        **state,
        "current_agent": "StrategyAgent",
        "final_report": final_report,
        "error_log": error_log,
    }
