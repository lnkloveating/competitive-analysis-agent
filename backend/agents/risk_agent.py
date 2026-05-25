"""Risk Agent - identify data quality, evidence, and compliance risks."""

from __future__ import annotations

import ast
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from .state import CompetitiveAnalysisState


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
VALID_RISK_TYPES = {"data_credibility", "data_timeliness", "evidence_gap", "compliance"}
VALID_SEVERITIES = {"high", "medium", "low"}
MATRIX_NAMES = ("product_matrix", "business_matrix")


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("RISK_AGENT_USE_LLM", "1").strip().lower()
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


def _risk_type(value: Any) -> str:
    text = _as_text(value).lower()
    if text in VALID_RISK_TYPES:
        return text
    if "credibility" in text or "可信" in text:
        return "data_credibility"
    if "timeliness" in text or "时效" in text or "过期" in text:
        return "data_timeliness"
    if "gap" in text or "不足" in text or "缺乏" in text:
        return "evidence_gap"
    if "compliance" in text or "版权" in text or "合规" in text:
        return "compliance"
    return "evidence_gap"


def _severity(value: Any, fallback: str = "medium") -> str:
    text = _as_text(value).lower()
    if text in VALID_SEVERITIES:
        return text
    if "高" in text or "严重" in text:
        return "high"
    if "低" in text or "轻微" in text:
        return "low"
    return fallback if fallback in VALID_SEVERITIES else "medium"


def _coerce_evidence_ids(value: Any, valid_ids: set[str] | None = None) -> List[str]:
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
        if not evidence_id:
            continue
        if valid_ids is not None and evidence_id not in valid_ids:
            continue
        if evidence_id not in evidence_ids:
            evidence_ids.append(evidence_id)
    return evidence_ids


def _extract_risk_records(payload: Any) -> List[Any]:
    if payload is None:
        return []
    if isinstance(payload, str):
        return _extract_risk_records(_parse_response(payload))
    if isinstance(payload, list):
        records: List[Any] = []
        for item in payload:
            records.extend(_extract_risk_records(item) if isinstance(item, (list, str)) else [item])
        return records
    if isinstance(payload, dict):
        for key in ("risk_flags", "risks", "data", "result", "items"):
            if key in payload:
                records = _extract_risk_records(payload[key])
                if records:
                    return records
        return [payload]
    return []


def _parse_publish_time(value: Any) -> datetime | None:
    text = _as_text(value)
    if not text:
        return None

    if re.search(r"近|最近|过去|within|last", text, re.IGNORECASE):
        return None

    patterns = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%Y-%m",
        "%Y/%m",
        "%Y.%m",
        "%Y年%m月%d日",
        "%Y年%m月",
    ]
    for pattern in patterns:
        try:
            return datetime.strptime(text[:10] if pattern == "%Y-%m-%d" else text, pattern)
        except ValueError:
            continue

    match = re.search(r"(20\d{2})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?", text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3) or 1)
        try:
            return datetime(year, month, day)
        except ValueError:
            return None
    return None


def _is_stale(value: Any, now: datetime) -> bool:
    publish_time = _parse_publish_time(value)
    if publish_time is None:
        return False
    return publish_time < now - timedelta(days=183)


def _risk_key(risk: Dict[str, Any]) -> tuple[str, str, str, tuple[str, ...]]:
    return (
        _as_text(risk.get("risk_type")),
        _as_text(risk.get("affected_platform")),
        _as_text(risk.get("affected_dimension")),
        tuple(risk.get("related_evidence_ids") or []),
    )


def _next_risk_id(index: int) -> str:
    return f"R{index:03d}"


def _matrix_cells(state: CompetitiveAnalysisState) -> Iterable[tuple[str, str, Dict[str, Any]]]:
    for matrix_name in MATRIX_NAMES:
        matrix = state.get(matrix_name, {})
        if not isinstance(matrix, dict):
            continue
        dimensions = matrix.get("dimensions", {})
        if not isinstance(dimensions, dict):
            continue
        for dimension, platform_map in dimensions.items():
            if not isinstance(platform_map, dict):
                continue
            for platform, cell in platform_map.items():
                yield _as_text(platform), _as_text(dimension), cell if isinstance(cell, dict) else {}


def _fallback_credibility_risks(state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    risks = []
    for evidence in state.get("evidence_list", []):
        if not isinstance(evidence, dict):
            continue
        credibility = _as_text(evidence.get("credibility")).lower()
        source_type = _as_text(evidence.get("source_type")).lower()
        if credibility != "low" and source_type not in {"review", "user_survey"}:
            continue

        evidence_id = _as_text(evidence.get("evidence_id"))
        platform = _as_text(evidence.get("platform")) or "未知平台"
        dimension = _as_text(evidence.get("related_dimension")) or "综合维度"
        risks.append(
            {
                "risk_type": "data_credibility",
                "description": f"{platform}在{dimension}上的结论引用了低可信度来源，可能影响判断可靠性。",
                "affected_platform": platform,
                "affected_dimension": dimension,
                "severity": "medium",
                "suggestion": "优先补充官网、财报或权威媒体来源，并在报告中降低该结论权重。",
                "related_evidence_ids": [evidence_id] if evidence_id else [],
            }
        )
    return risks


def _fallback_timeliness_risks(state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    now = datetime.now()
    risks = []
    for evidence in state.get("evidence_list", []):
        if not isinstance(evidence, dict):
            continue
        if not _is_stale(evidence.get("publish_time"), now):
            continue

        evidence_id = _as_text(evidence.get("evidence_id"))
        platform = _as_text(evidence.get("platform")) or "未知平台"
        dimension = _as_text(evidence.get("related_dimension")) or "综合维度"
        risks.append(
            {
                "risk_type": "data_timeliness",
                "description": f"{platform}在{dimension}上的证据发布时间超过6个月，可能无法反映最新竞争态势。",
                "affected_platform": platform,
                "affected_dimension": dimension,
                "severity": "medium",
                "suggestion": "补充近6个月的官网公告、财报、新闻或应用商店信息。",
                "related_evidence_ids": [evidence_id] if evidence_id else [],
            }
        )
    return risks


def _fallback_gap_risks(state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    risks = []
    for platform, dimension, cell in _matrix_cells(state):
        evidence_ids = _coerce_evidence_ids(cell.get("evidence_ids") or cell.get("evidenceIds"))
        if evidence_ids:
            continue
        risks.append(
            {
                "risk_type": "evidence_gap",
                "description": f"{platform}在{dimension}上的矩阵结论缺少直接证据引用，评分可能偏主观。",
                "affected_platform": platform or "未知平台",
                "affected_dimension": dimension or "未知维度",
                "severity": "low",
                "suggestion": "为该平台和维度补充至少1条可追溯证据，或在结论中标记为低置信度。",
                "related_evidence_ids": [],
            }
        )
    return risks


def _fallback_compliance_risks(state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    risks = []
    for platform, dimension, cell in _matrix_cells(state):
        summary = _as_text(cell.get("summary"))
        evidence_ids = _coerce_evidence_ids(cell.get("evidence_ids") or cell.get("evidenceIds"))
        combined = f"{dimension} {summary}"
        if not re.search(r"版权|授权|合规|rights|copyright|license", combined, re.IGNORECASE):
            continue

        severity = "medium" if evidence_ids else "high"
        risks.append(
            {
                "risk_type": "compliance",
                "description": f"{platform}在{dimension}上的分析涉及版权、授权或内容合规判断，需要核验证据来源与适用范围。",
                "affected_platform": platform or "未知平台",
                "affected_dimension": dimension or "未知维度",
                "severity": severity,
                "suggestion": "补充版权授权、财报披露或官方公告证据，避免将推测性信息作为确定结论。",
                "related_evidence_ids": evidence_ids,
            }
        )
    return risks


def _fallback_risks(state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    risks = []
    risks.extend(_fallback_credibility_risks(state))
    risks.extend(_fallback_timeliness_risks(state))
    risks.extend(_fallback_gap_risks(state))
    risks.extend(_fallback_compliance_risks(state))
    return risks


def _build_prompt(state: CompetitiveAnalysisState) -> str:
    payload = {
        "product_matrix": state.get("product_matrix", {}),
        "business_matrix": state.get("business_matrix", {}),
        "evidence_list": state.get("evidence_list", []),
    }
    return f"""
你是 RiskAgent，负责识别长视频平台竞品分析中的风险。

风险类型只能使用：
- data_credibility：结论来自低可信度来源
- data_timeliness：数据超过6个月
- evidence_gap：结论缺乏足够证据
- compliance：版权合规风险

请只输出 JSON 数组，不要输出 Markdown 或解释文字。每条格式如下：
{{
  "risk_type": "data_credibility/data_timeliness/evidence_gap/compliance",
  "description": "风险描述",
  "affected_platform": "受影响平台",
  "affected_dimension": "受影响维度",
  "severity": "high/medium/low",
  "suggestion": "建议处理方式",
  "related_evidence_ids": ["EV001"]
}}

输入数据：
{json.dumps(payload, ensure_ascii=False)}
""".strip()


def _generate_with_llm(llm: ChatOpenAI | None, state: CompetitiveAnalysisState) -> List[Any]:
    if llm is None:
        return []
    response = llm.invoke(_build_prompt(state))
    parsed = _parse_response(_response_to_text(response))
    return _extract_risk_records(parsed)


def _normalize_risk(
    item: Any,
    fallback_index: int,
    valid_ids: set[str],
) -> Dict[str, Any] | None:
    if not isinstance(item, dict):
        return None

    risk_type = _risk_type(item.get("risk_type") or item.get("riskType") or item.get("type"))
    affected_platform = _as_text(
        item.get("affected_platform")
        or item.get("affectedPlatform")
        or item.get("platform")
        or item.get("affected_conclusion")
    )
    affected_dimension = _as_text(
        item.get("affected_dimension")
        or item.get("affectedDimension")
        or item.get("dimension")
        or item.get("related_dimension")
    )
    related_ids = _coerce_evidence_ids(
        item.get("related_evidence_ids")
        or item.get("relatedEvidenceIds")
        or item.get("evidence_ids")
        or item.get("evidence"),
        valid_ids,
    )

    description = _as_text(item.get("description") or item.get("risk") or item.get("summary"))
    if not description:
        description = f"{affected_platform or '相关平台'}在{affected_dimension or '相关维度'}上存在{risk_type}风险。"

    suggestion = _as_text(item.get("suggestion") or item.get("mitigation") or item.get("action"))
    if not suggestion:
        suggestion = "补充可追溯证据，并在最终报告中标注置信度与限制条件。"

    return {
        "risk_id": _as_text(item.get("risk_id") or item.get("riskId")) or _next_risk_id(fallback_index),
        "risk_type": risk_type,
        "description": description,
        "affected_platform": affected_platform or "未知平台",
        "affected_dimension": affected_dimension or "综合维度",
        "severity": _severity(item.get("severity"), "medium"),
        "suggestion": suggestion,
        "related_evidence_ids": related_ids,
    }


def _normalize_risks(items: List[Any], state: CompetitiveAnalysisState) -> List[Dict[str, Any]]:
    valid_ids = {
        _as_text(evidence.get("evidence_id"))
        for evidence in state.get("evidence_list", [])
        if isinstance(evidence, dict) and evidence.get("evidence_id")
    }
    risks = []
    seen = set()

    for item in items:
        normalized = _normalize_risk(item, len(risks) + 1, valid_ids)
        if not normalized:
            continue
        key = _risk_key(normalized)
        if key in seen:
            continue
        seen.add(key)
        normalized["risk_id"] = _next_risk_id(len(risks) + 1)
        risks.append(normalized)

    return risks


def risk_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """Identify risk flags from product/business matrices and evidence records."""
    _load_env()
    error_log = list(state.get("error_log", []))
    fallback_items = _fallback_risks(state)

    llm: ChatOpenAI | None = None
    if not _llm_enabled():
        error_log.append("RiskAgent 已按 RISK_AGENT_USE_LLM 配置跳过 LLM 调用，使用兜底风险识别。")
    elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = get_llm()
        except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
            error_log.append(f"RiskAgent 初始化 LLM 失败：{exc}")
    else:
        error_log.append("RiskAgent 未找到 ARK_EP 或 ARK_API_KEY，已启用兜底风险识别。")

    try:
        llm_items = _generate_with_llm(llm, state)
        risk_flags = _normalize_risks([*fallback_items, *llm_items], state)
    except Exception as exc:
        error_log.append(f"RiskAgent 识别风险失败：{exc}")
        risk_flags = _normalize_risks(fallback_items, state)

    print(f"[RiskAgent] 风险识别完成，共 {len(risk_flags)} 条风险")
    return {
        **state,
        "current_agent": "RiskAgent",
        "risk_flags": risk_flags,
        "error_log": error_log,
    }
