"""Business Agent - build business comparison matrix and business claims."""

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

from app.schemas.business import BusinessAgentOutput
from app.schemas.claim import Claim


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
BUSINESS_DIMENSION_KEYWORDS = (
    "定价",
    "价格",
    "渠道",
    "市场",
    "品牌",
    "产品线",
    "商业",
    "增长",
    "覆盖",
    "收入",
    "用户群体",
    "定位",
    "pricing",
    "channel",
    "market",
    "brand",
    "business",
    "growth",
    "revenue",
)


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("BUSINESS_AGENT_USE_LLM", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("ARK_EP", ""),
        api_key=os.getenv("ARK_API_KEY", ""),
        base_url=BASE_URL,
        temperature=0.1,
        timeout=45,
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


def _dimension_key(value: Any) -> str:
    return re.sub(r"[\s_\-]+", "", _as_text(value).lower())


def _canonical_dimension(value: Any, dimensions: List[str]) -> str | None:
    text = _dimension_key(value)
    if not text:
        return None

    for dimension in dimensions:
        dimension_text = _dimension_key(dimension)
        if text == dimension_text or dimension_text in text or text in dimension_text:
            return dimension
    return None


def _get_platforms(evidence_list: List[Dict[str, Any]], competitors: List[str]) -> List[str]:
    platforms: List[str] = []
    for evidence in evidence_list:
        if isinstance(evidence, dict):
            platform = _as_text(evidence.get("platform"))
            if platform and platform not in platforms:
                platforms.append(platform)
    for platform in competitors:
        platform_text = _as_text(platform)
        if platform_text and platform_text not in platforms:
            platforms.append(platform_text)
    return platforms


def _valid_evidence_ids(evidence_list: List[Dict[str, Any]]) -> set[str]:
    return {
        _as_text(evidence.get("evidence_id"))
        for evidence in evidence_list
        if isinstance(evidence, dict) and evidence.get("evidence_id")
    }


def _coerce_evidence_ids(value: Any, valid_ids: set[str]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        candidates = re.findall(r"EV\d{3,}", value)
    elif isinstance(value, list):
        candidates = [_as_text(item) for item in value]
    else:
        candidates = [_as_text(value)]

    evidence_ids: List[str] = []
    for evidence_id in candidates:
        if evidence_id in valid_ids and evidence_id not in evidence_ids:
            evidence_ids.append(evidence_id)
    return evidence_ids


def _evidence_confidence(evidence: Dict[str, Any]) -> float:
    value = evidence.get("confidence_score")
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))

    credibility = _as_text(evidence.get("credibility")).lower()
    if credibility == "high":
        return 0.85
    if credibility == "medium":
        return 0.7
    if credibility == "low":
        return 0.4
    return 0.6


def _average_confidence(items: List[Dict[str, Any]]) -> float:
    if not items:
        return 0.0
    return round(sum(_evidence_confidence(item) for item in items) / len(items), 2)


def _score_from_evidence(items: List[Dict[str, Any]]) -> int:
    if not items:
        return 3

    credibility_score = {"high": 4, "medium": 3, "low": 2}
    scores = [
        credibility_score.get(_as_text(item.get("credibility")).lower(), 3)
        for item in items
    ]
    score = round(sum(scores) / len(scores))
    if len(items) >= 3 and score < 5:
        score += 1
    return max(1, min(5, score))


def _related_evidence(
    evidence_list: List[Dict[str, Any]],
    platform: str,
    dimension: str,
    dimensions: List[str],
) -> List[Dict[str, Any]]:
    related = []
    for evidence in evidence_list:
        if not isinstance(evidence, dict):
            continue
        if _as_text(evidence.get("platform")) != platform:
            continue

        evidence_dimension = _canonical_dimension(
            evidence.get("related_dimension")
            or evidence.get("dimension")
            or evidence.get("topic"),
            dimensions,
        )
        raw_content = _as_text(evidence.get("raw_content") or evidence.get("claim"))
        content_dimension = _canonical_dimension(raw_content, dimensions)
        if evidence_dimension == dimension or content_dimension == dimension:
            related.append(evidence)
    return related


def _matrix_cell(
    evidence_list: List[Dict[str, Any]],
    platform: str,
    dimension: str,
    dimensions: List[str],
) -> Dict[str, Any]:
    related = _related_evidence(evidence_list, platform, dimension, dimensions)
    evidence_ids = [
        _as_text(item.get("evidence_id"))
        for item in related
        if item.get("evidence_id")
    ]
    evidence_ids = list(dict.fromkeys(evidence_ids))
    confidence_score = _average_confidence(related)

    if related:
        first_claim = _as_text(related[0].get("claim") or related[0].get("raw_content"))
        summary = (
            f"基于{', '.join(evidence_ids[:3])}，{platform}在{dimension}维度已有可用于商业判断的证据："
            f"{first_claim[:80]}"
        )
    else:
        summary = (
            f"暂无{platform}在{dimension}维度的直接证据，存在 evidence_gap，"
            "建议后续补充商业专项采集。"
        )

    return {
        "score": _score_from_evidence(related),
        "summary": summary,
        "analysis": summary,
        "evidence_ids": evidence_ids,
        "confidence_score": confidence_score,
    }


def _build_fallback_matrix(
    evidence_list: List[Dict[str, Any]],
    competitors: List[str],
    dimensions: List[str],
) -> Dict[str, Any]:
    platforms = _get_platforms(evidence_list, competitors)
    matrix_dimensions: Dict[str, Dict[str, Dict[str, Any]]] = {}

    for dimension in dimensions:
        matrix_dimensions[dimension] = {}
        for platform in platforms:
            matrix_dimensions[dimension][platform] = _matrix_cell(
                evidence_list=evidence_list,
                platform=platform,
                dimension=dimension,
                dimensions=dimensions,
            )

    return {
        "dimensions": matrix_dimensions,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _build_prompt(
    evidence_list: List[Dict[str, Any]],
    competitors: List[str],
    dimensions: List[str],
) -> str:
    platforms = _get_platforms(evidence_list, competitors)
    return f"""
你是 BusinessAgent。

你的职责：
- 只分析商业相关维度，例如定价策略、渠道策略、市场定位、品牌定位、产品线策略、商业模式、增长趋势、市场覆盖。
- 你只能基于输入 evidence_list。
- 你不能创造新的 evidence。
- 你不能生成最终战略报告。
- 你不能生成没有 evidence_ids 支撑的 claim。
- 你输出的每条 claim 必须引用 evidence_ids。
- evidence_ids 必须来自输入 evidence_list。
- 如果某个维度证据不足，必须说明 evidence_gap，不要编造内容。
- 如果 focus_dimensions 里包含硬件性能、软件驱动等产品维度，只能从商业角度轻量描述，不要生成产品技术结论。

你必须输出 JSON，格式如下：
{{
  "business_matrix": {{
    "品牌名": {{
      "维度名": {{
        "analysis": "分析内容",
        "evidence_ids": ["EV001"]
      }}
    }}
  }},
  "claims": [
    {{
      "claim_id": "BCL001",
      "content": "一句结构化商业结论",
      "dimension": "定价策略",
      "related_platforms": ["雷蛇"],
      "evidence_ids": ["EV001"],
      "confidence_score": 0.8,
      "generated_by": "BusinessAgent"
    }}
  ]
}}

分析对象：{json.dumps(platforms, ensure_ascii=False)}
分析维度：{json.dumps(dimensions, ensure_ascii=False)}
evidence_list：{json.dumps(evidence_list, ensure_ascii=False)}
""".strip()


def _generate_with_llm(
    llm: ChatOpenAI | None,
    evidence_list: List[Dict[str, Any]],
    competitors: List[str],
    dimensions: List[str],
) -> Any:
    if llm is None:
        return None
    response = llm.invoke(_build_prompt(evidence_list, competitors, dimensions))
    return _parse_response(_response_to_text(response))


def _normalize_llm_matrix(
    payload: Any,
    fallback: Dict[str, Any],
    evidence_list: List[Dict[str, Any]],
    competitors: List[str],
    dimensions: List[str],
) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return fallback

    matrix_payload = payload.get("business_matrix") or payload.get("matrix")
    if not isinstance(matrix_payload, dict):
        return fallback

    valid_ids = _valid_evidence_ids(evidence_list)
    platforms = _get_platforms(evidence_list, competitors)
    normalized = {"dimensions": {}, "generated_at": fallback.get("generated_at")}

    old_style_dimensions = matrix_payload.get("dimensions")
    if isinstance(old_style_dimensions, dict):
        matrix_payload = old_style_dimensions

    for dimension in dimensions:
        normalized["dimensions"][dimension] = {}
        for platform in platforms:
            fallback_cell = fallback["dimensions"][dimension][platform]
            cell = {}
            if platform in matrix_payload and isinstance(matrix_payload[platform], dict):
                cell = matrix_payload[platform].get(dimension, {})
            elif dimension in matrix_payload and isinstance(matrix_payload[dimension], dict):
                cell = matrix_payload[dimension].get(platform, {})
            if not isinstance(cell, dict):
                cell = {}

            evidence_ids = _coerce_evidence_ids(cell.get("evidence_ids") or cell.get("evidence"), valid_ids)
            if not evidence_ids:
                evidence_ids = fallback_cell["evidence_ids"]

            analysis = _as_text(cell.get("analysis") or cell.get("summary") or cell.get("description"))
            if not analysis:
                analysis = fallback_cell["summary"]

            normalized["dimensions"][dimension][platform] = {
                "score": fallback_cell["score"],
                "summary": analysis,
                "analysis": analysis,
                "evidence_ids": evidence_ids,
                "confidence_score": fallback_cell["confidence_score"],
            }
    return normalized


def _next_claim_id(existing_claims: List[Dict[str, Any]], index: int) -> str:
    existing_bcl_count = sum(
        1
        for claim in existing_claims
        if str(claim.get("claim_id", "")).startswith("BCL")
    )
    return f"BCL{existing_bcl_count + index:03d}"


def _business_dimension_priority(dimension: str) -> int:
    dimension_text = _as_text(dimension).lower()
    return 0 if any(keyword in dimension_text for keyword in BUSINESS_DIMENSION_KEYWORDS) else 1


def _claim_from_related(
    claim_id: str,
    platform: str,
    dimension: str,
    related: List[Dict[str, Any]],
) -> Claim | None:
    evidence_ids = [
        _as_text(item.get("evidence_id"))
        for item in related
        if item.get("evidence_id")
    ]
    evidence_ids = list(dict.fromkeys(evidence_ids))
    if not evidence_ids:
        return None

    first_claim = _as_text(related[0].get("claim") or related[0].get("raw_content") or related[0].get("summary"))
    content = (
        f"{platform}在{dimension}维度存在可用于商业判断的证据，主要体现为："
        f"{first_claim[:90]}"
    )
    return Claim(
        claim_id=claim_id,
        content=content,
        dimension=dimension,
        related_platforms=[platform],
        evidence_ids=evidence_ids[:3],
        confidence_score=_average_confidence(related),
        generated_by="BusinessAgent",
    )


def _build_fallback_claims(
    existing_claims: List[Dict[str, Any]],
    evidence_list: List[Dict[str, Any]],
    competitors: List[str],
    dimensions: List[str],
) -> List[Dict[str, Any]]:
    platforms = _get_platforms(evidence_list, competitors)
    valid_ids = _valid_evidence_ids(evidence_list)
    claims: List[Dict[str, Any]] = []

    ordered_dimensions = sorted(dimensions, key=_business_dimension_priority)
    for dimension in ordered_dimensions:
        for platform in platforms:
            related = _related_evidence(evidence_list, platform, dimension, dimensions)
            related = [
                item
                for item in related
                if _as_text(item.get("evidence_id")) in valid_ids
            ]
            if not related:
                continue

            claim = _claim_from_related(
                claim_id=_next_claim_id(existing_claims, len(claims) + 1),
                platform=platform,
                dimension=dimension,
                related=related,
            )
            if claim is not None:
                claims.append(claim.model_dump())

    return claims


def _normalize_llm_claims(
    payload: Any,
    fallback_claims: List[Dict[str, Any]],
    existing_claims: List[Dict[str, Any]],
    valid_ids: set[str],
) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("claims"), list):
        return fallback_claims

    claims = []
    for item in payload["claims"]:
        if not isinstance(item, dict):
            continue
        evidence_ids = _coerce_evidence_ids(item.get("evidence_ids"), valid_ids)
        if not evidence_ids:
            continue
        try:
            claim = Claim(
                claim_id=_as_text(item.get("claim_id")) or _next_claim_id(existing_claims, len(claims) + 1),
                content=_as_text(item.get("content")) or "商业维度结论缺少内容，已按证据约束生成占位结论。",
                dimension=_as_text(item.get("dimension")) or "general",
                related_platforms=[
                    platform for platform in item.get("related_platforms", []) if _as_text(platform)
                ]
                or ["未知平台"],
                evidence_ids=evidence_ids,
                confidence_score=float(item.get("confidence_score", 0.7)),
                generated_by="BusinessAgent",
            )
        except Exception:
            continue
        claim.claim_id = _next_claim_id(existing_claims, len(claims) + 1)
        claims.append(claim.model_dump())

    return claims or fallback_claims


def _append_trace(state: dict, business_claims: List[Dict[str, Any]]) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "BusinessAgent",
            "status": "success",
            "output_summary": f"generated business_matrix and {len(business_claims)} business claims",
            "error": None,
        }
    )


def business_agent(state: dict) -> Dict[str, Any]:
    """Analyze business dimensions and output a matrix plus business claims."""
    _load_env()
    evidence_list = [
        item for item in state.get("evidence_list", [])
        if isinstance(item, dict)
    ]
    competitors = [
        _as_text(item) for item in state.get("competitors", [])
        if _as_text(item)
    ]
    dimensions = [
        _as_text(item) for item in state.get("focus_dimensions", [])
        if _as_text(item)
    ] or ["general"]
    existing_claims = [
        item for item in state.get("claims", [])
        if isinstance(item, dict)
    ]

    fallback_matrix = _build_fallback_matrix(evidence_list, competitors, dimensions)
    fallback_claims = _build_fallback_claims(existing_claims, evidence_list, competitors, dimensions)
    valid_ids = _valid_evidence_ids(evidence_list)

    llm: ChatOpenAI | None = None
    if _llm_enabled() and os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = _get_llm()
        except Exception:
            llm = None

    try:
        llm_payload = _generate_with_llm(llm, evidence_list, competitors, dimensions)
        business_matrix = _normalize_llm_matrix(
            payload=llm_payload,
            fallback=fallback_matrix,
            evidence_list=evidence_list,
            competitors=competitors,
            dimensions=dimensions,
        )
        business_claims = _normalize_llm_claims(
            payload=llm_payload,
            fallback_claims=fallback_claims,
            existing_claims=existing_claims,
            valid_ids=valid_ids,
        )
    except Exception:
        business_matrix = fallback_matrix
        business_claims = fallback_claims

    output = BusinessAgentOutput(
        business_matrix=business_matrix,
        claims=[Claim.model_validate(item) for item in business_claims],
    )
    business_claim_dicts = [claim.model_dump() for claim in output.claims]

    next_state = {
        **state,
        "current_agent": "BusinessAgent",
        "business_matrix": output.business_matrix,
        "claims": [*existing_claims, *business_claim_dicts],
    }
    _append_trace(next_state, business_claim_dicts)

    dimension_count = len(output.business_matrix.get("dimensions", {}))
    print(f"[BusinessAgent] 商业矩阵生成完成，共 {dimension_count} 个维度")
    return next_state
