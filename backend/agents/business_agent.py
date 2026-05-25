"""Business Agent - build business model comparison matrix."""

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


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("BUSINESS_AGENT_USE_LLM", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def get_llm() -> ChatOpenAI:
    """Create the Doubao Ark-compatible chat model."""
    _load_env()
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


def _get_platforms(state: CompetitiveAnalysisState) -> List[str]:
    platforms: List[str] = []
    for platform in [state.get("target_platform", ""), *state.get("competitors", [])]:
        if platform and platform not in platforms:
            platforms.append(platform)

    for evidence in state.get("evidence_list", []):
        if isinstance(evidence, dict):
            platform = _as_text(evidence.get("platform"))
            if platform and platform not in platforms:
                platforms.append(platform)
    return platforms


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


def _coerce_score(value: Any, fallback: int = 3) -> int:
    if isinstance(value, (int, float)):
        score = int(round(value))
    else:
        match = re.search(r"\d+", _as_text(value))
        score = int(match.group()) if match else fallback
    return max(1, min(5, score))


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


def _related_evidence(
    evidence_list: List[Dict[str, Any]],
    platform: str,
    dimension: str,
    dimensions: List[str],
) -> List[Dict[str, Any]]:
    related = []
    for evidence in evidence_list:
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


def _fallback_cell(
    evidence_list: List[Dict[str, Any]],
    platform: str,
    dimension: str,
    dimensions: List[str],
) -> Dict[str, Any]:
    related = _related_evidence(evidence_list, platform, dimension, dimensions)
    evidence_ids = [_as_text(item.get("evidence_id")) for item in related if item.get("evidence_id")]
    evidence_ids = list(dict.fromkeys(evidence_ids))

    if related:
        first_claim = _as_text(related[0].get("claim") or related[0].get("raw_content"))
        summary = f"基于{', '.join(evidence_ids[:3])}，{platform}在{dimension}上已有证据支撑：{first_claim[:80]}"
    else:
        summary = f"暂无{platform}在{dimension}上的直接证据，按现有公开信息保守估计，建议后续补充商业专项采集。"

    return {
        "score": _score_from_evidence(related),
        "summary": summary,
        "evidence_ids": evidence_ids,
    }


def _fallback_matrix(state: CompetitiveAnalysisState) -> Dict[str, Any]:
    platforms = _get_platforms(state)
    evidence_list = [
        item for item in state.get("evidence_list", [])
        if isinstance(item, dict)
    ]
    analysis_dimensions = get_state_dimensions(state)
    dimensions = {}

    for dimension in analysis_dimensions:
        dimensions[dimension] = {}
        for platform in platforms:
            dimensions[dimension][platform] = _fallback_cell(
                evidence_list,
                platform,
                dimension,
                analysis_dimensions,
            )

    return {
        "dimensions": dimensions,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _build_prompt(state: CompetitiveAnalysisState) -> str:
    platforms = _get_platforms(state)
    evidence_list = state.get("evidence_list", [])
    dimensions = get_state_dimensions(state)
    industry_name = get_state_industry_name(state)
    example_platform = platforms[0] if platforms else "目标品牌"
    format_example = {
        "dimensions": {
            dimension: (
                {
                    example_platform: {
                        "score": 4,
                        "summary": "说明",
                        "evidence_ids": ["EV001"],
                    }
                }
                if index == 0
                else {}
            )
            for index, dimension in enumerate(dimensions)
        },
        "generated_at": "时间戳",
    }
    return f"""
你是 BusinessAgent，负责基于证据列表生成{industry_name}商业维度对比矩阵。

分析对象：{", ".join(platforms)}
分析维度：{", ".join(dimensions)}
目标用户：{state.get("target_user", "")}

请只输出 JSON，不要输出 Markdown 或解释文字。输出格式必须为：
{json.dumps(format_example, ensure_ascii=False, indent=2)}

规则：
- 每个平台在每个维度都要有 score、summary、evidence_ids。
- score 为 1-5 的整数，5 表示商业竞争力最强。
- evidence_ids 只能引用证据列表中存在的 evidence_id。
- summary 用一句中文说明评分原因。

证据列表：
{json.dumps(evidence_list, ensure_ascii=False)}
""".strip()


def _extract_matrix_payload(payload: Any) -> Any:
    if payload is None:
        return None
    if isinstance(payload, str):
        return _extract_matrix_payload(_parse_response(payload))
    if isinstance(payload, dict):
        for key in ("business_matrix", "matrix", "data", "result"):
            if key in payload:
                return _extract_matrix_payload(payload[key])
        return payload
    if isinstance(payload, list):
        return payload
    return None


def _rows_to_dimensions(
    rows: List[Any],
    dimensions: List[str],
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    dimension_rows: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        dimension = _canonical_dimension(row.get("dimension") or row.get("related_dimension"), dimensions)
        platform = _as_text(row.get("platform"))
        if not dimension or not platform:
            continue
        dimension_rows.setdefault(dimension, {})[platform] = row
    return dimension_rows


def _find_dimension_block(
    dimensions_payload: Dict[str, Any],
    dimension: str,
    dimensions: List[str],
) -> Dict[str, Any]:
    for key, value in dimensions_payload.items():
        if _canonical_dimension(key, dimensions) == dimension and isinstance(value, dict):
            return value
    return {}


def _normalize_cell(
    cell: Any,
    fallback: Dict[str, Any],
    valid_ids: set[str],
) -> Dict[str, Any]:
    if not isinstance(cell, dict):
        cell = {}

    evidence_ids = _coerce_evidence_ids(
        cell.get("evidence_ids")
        or cell.get("evidenceIds")
        or cell.get("evidence_id")
        or cell.get("evidence"),
        valid_ids,
    )
    if not evidence_ids:
        evidence_ids = fallback["evidence_ids"]

    summary = _as_text(cell.get("summary") or cell.get("description") or cell.get("reason"))
    if not summary:
        summary = fallback["summary"]

    return {
        "score": _coerce_score(cell.get("score"), fallback["score"]),
        "summary": summary,
        "evidence_ids": evidence_ids,
    }


def _normalize_matrix(
    payload: Any,
    state: CompetitiveAnalysisState,
    fallback: Dict[str, Any],
) -> Dict[str, Any]:
    matrix_payload = _extract_matrix_payload(payload)
    if matrix_payload is None:
        return fallback

    dimensions = get_state_dimensions(state)
    if isinstance(matrix_payload, list):
        dimensions_payload = _rows_to_dimensions(matrix_payload, dimensions)
    elif isinstance(matrix_payload, dict):
        raw_dimensions = matrix_payload.get("dimensions") if isinstance(matrix_payload.get("dimensions"), dict) else matrix_payload
        dimensions_payload = raw_dimensions if isinstance(raw_dimensions, dict) else {}
    else:
        return fallback

    evidence_list = [item for item in state.get("evidence_list", []) if isinstance(item, dict)]
    valid_ids = {_as_text(item.get("evidence_id")) for item in evidence_list if item.get("evidence_id")}
    platforms = _get_platforms(state)
    normalized_dimensions = {}

    for dimension in dimensions:
        dimension_block = _find_dimension_block(dimensions_payload, dimension, dimensions)
        normalized_dimensions[dimension] = {}
        for platform in platforms:
            fallback_cell = fallback["dimensions"][dimension][platform]
            cell = dimension_block.get(platform, {})
            normalized_dimensions[dimension][platform] = _normalize_cell(cell, fallback_cell, valid_ids)

    generated_at = ""
    if isinstance(matrix_payload, dict):
        generated_at = _as_text(matrix_payload.get("generated_at") or matrix_payload.get("generatedAt"))

    return {
        "dimensions": normalized_dimensions,
        "generated_at": generated_at or fallback["generated_at"],
    }


def _generate_with_llm(llm: ChatOpenAI | None, state: CompetitiveAnalysisState) -> Any:
    if llm is None:
        return None
    response = llm.invoke(_build_prompt(state))
    return _parse_response(_response_to_text(response))


def business_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """Analyze business dimensions and output a platform comparison matrix."""
    _load_env()
    error_log = list(state.get("error_log", []))
    fallback = _fallback_matrix(state)

    llm: ChatOpenAI | None = None
    if not _llm_enabled():
        error_log.append("BusinessAgent 已按 BUSINESS_AGENT_USE_LLM 配置跳过 LLM 调用，使用兜底商业矩阵。")
    elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = get_llm()
        except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
            error_log.append(f"BusinessAgent 初始化 LLM 失败：{exc}")
    else:
        error_log.append("BusinessAgent 未找到 ARK_EP 或 ARK_API_KEY，已启用兜底商业矩阵。")

    try:
        llm_payload = _generate_with_llm(llm, state)
        business_matrix = _normalize_matrix(llm_payload, state, fallback)
    except Exception as exc:
        error_log.append(f"BusinessAgent 生成商业矩阵失败：{exc}")
        business_matrix = fallback

    dimension_count = len(business_matrix.get("dimensions", {}))
    print(f"[BusinessAgent] 商业矩阵生成完成，共 {dimension_count} 个维度")
    return {
        **state,
        "current_agent": "BusinessAgent",
        "business_matrix": business_matrix,
        "error_log": error_log,
    }
