"""Quality Agent - inspect analysis quality and route rejected work."""

from __future__ import annotations

import ast
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from .state import CompetitiveAnalysisState


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
MAX_ITERATIONS = 3
VALID_STATUSES = {"approved", "rejected"}
VALID_TARGET_AGENTS = {"EvidenceAgent", "ProductAgent", "BusinessAgent", "ResearchAgent"}
ROUTER_MAP = {
    "EvidenceAgent": "evidence_agent",
    "ProductAgent": "product_agent",
    "BusinessAgent": "business_agent",
    "ResearchAgent": "research_agent",
}


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("QUALITY_AGENT_USE_LLM", "1").strip().lower()
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


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_as_text(item) for item in value if _as_text(item)]
    text = _as_text(value)
    return [text] if text else []


def _coerce_score(value: Any, fallback: int = 70) -> int:
    if isinstance(value, (int, float)):
        score = int(round(value))
    else:
        match = re.search(r"\d+", _as_text(value))
        score = int(match.group()) if match else fallback
    return max(0, min(100, score))


def _coerce_evidence_ids(value: Any) -> List[str]:
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
        if evidence_id and evidence_id not in evidence_ids:
            evidence_ids.append(evidence_id)
    return evidence_ids


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
            yield _as_text(dimension), _as_text(platform), cell if isinstance(cell, dict) else {}


def _evidence_map(state: CompetitiveAnalysisState) -> Dict[str, Dict[str, Any]]:
    evidence_by_id = {}
    for evidence in state.get("evidence_list", []):
        if isinstance(evidence, dict):
            evidence_id = _as_text(evidence.get("evidence_id"))
            if evidence_id:
                evidence_by_id[evidence_id] = evidence
    return evidence_by_id


def _matrix_stats(matrix: Any, platforms: List[str]) -> Dict[str, Any]:
    cells = list(_matrix_cells(matrix))
    dimensions = {}
    missing_evidence_cells = []
    missing_platform_cells = []

    if isinstance(matrix, dict) and isinstance(matrix.get("dimensions"), dict):
        dimensions = matrix["dimensions"]
        for dimension, platform_map in dimensions.items():
            if not isinstance(platform_map, dict):
                missing_platform_cells.append((_as_text(dimension), "全部平台"))
                continue
            for platform in platforms:
                if platform not in platform_map:
                    missing_platform_cells.append((_as_text(dimension), platform))

    for dimension, platform, cell in cells:
        evidence_ids = _coerce_evidence_ids(cell.get("evidence_ids") or cell.get("evidenceIds"))
        if not evidence_ids:
            missing_evidence_cells.append((dimension, platform))

    return {
        "cell_count": len(cells),
        "dimension_count": len(dimensions),
        "missing_evidence_cells": missing_evidence_cells,
        "missing_platform_cells": missing_platform_cells,
    }


def _high_support_ratio(state: CompetitiveAnalysisState) -> float:
    evidence_by_id = _evidence_map(state)
    cells = [
        *list(_matrix_cells(state.get("product_matrix", {}))),
        *list(_matrix_cells(state.get("business_matrix", {}))),
    ]
    if not cells:
        return 0.0

    supported = 0
    for _, _, cell in cells:
        evidence_ids = _coerce_evidence_ids(cell.get("evidence_ids") or cell.get("evidenceIds"))
        if any(_as_text(evidence_by_id.get(eid, {}).get("credibility")).lower() == "high" for eid in evidence_ids):
            supported += 1
    return supported / len(cells)


def _target_for_failures(failed_checks: List[str]) -> tuple[str, str]:
    if any("原始数据" in check for check in failed_checks):
        return "ResearchAgent", "补充 raw_research 原始采集数据，确保每个平台至少有可追溯公开来源。"
    if any("高严重性风险" in check for check in failed_checks):
        return "EvidenceAgent", "针对高严重性风险补充高可信度证据，必要时重做证据结构化。"
    if any("证据ID" in check or "高可信度证据" in check for check in failed_checks):
        return "EvidenceAgent", "补齐矩阵结论对应的 evidence_id，并补充官网、财报或权威媒体证据。"
    if any("产品矩阵" in check for check in failed_checks):
        return "ProductAgent", "补齐产品矩阵中缺失的平台、维度、评分、说明和证据引用。"
    if any("商业矩阵" in check for check in failed_checks):
        return "BusinessAgent", "补齐商业矩阵中缺失的平台、维度、评分、说明和证据引用。"
    return "EvidenceAgent", "补充证据并重新生成分析矩阵。"


def _local_quality_result(state: CompetitiveAnalysisState) -> Dict[str, Any]:
    platforms = _get_platforms(state)
    evidence_list = [item for item in state.get("evidence_list", []) if isinstance(item, dict)]
    product_stats = _matrix_stats(state.get("product_matrix", {}), platforms)
    business_stats = _matrix_stats(state.get("business_matrix", {}), platforms)
    high_risks = [
        risk for risk in state.get("risk_flags", [])
        if isinstance(risk, dict) and _as_text(risk.get("severity")).lower() == "high"
    ]

    passed_checks: List[str] = []
    failed_checks: List[str] = []
    deductions = 0

    if not state.get("raw_research") and not evidence_list:
        failed_checks.append("原始数据不足：缺少 raw_research 和 evidence_list")
        deductions += 35
    else:
        passed_checks.append("原始数据可用于质检")

    missing_evidence_count = len(product_stats["missing_evidence_cells"]) + len(business_stats["missing_evidence_cells"])
    if missing_evidence_count:
        failed_checks.append(f"证据ID支撑不足：{missing_evidence_count} 个矩阵结论缺少 evidence_id")
        deductions += min(30, 8 + missing_evidence_count * 2)
    else:
        passed_checks.append("关键矩阵结论均有 evidence_id 支撑")

    high_support = _high_support_ratio(state)
    high_evidence_count = sum(1 for item in evidence_list if _as_text(item.get("credibility")).lower() == "high")
    if not evidence_list or high_evidence_count == 0 or high_support < 0.3:
        failed_checks.append("高可信度证据不足：核心结论缺少足够 high 级证据支撑")
        deductions += 20
    else:
        passed_checks.append("核心结论具备高可信度证据支撑")

    product_missing = len(product_stats["missing_platform_cells"])
    if product_stats["cell_count"] == 0 or product_missing:
        failed_checks.append(f"产品矩阵不完整：缺失 {product_missing} 个平台维度单元")
        deductions += min(20, 8 + product_missing)
    else:
        passed_checks.append("产品矩阵平台覆盖完整")

    business_missing = len(business_stats["missing_platform_cells"])
    if business_stats["cell_count"] == 0 or business_missing:
        failed_checks.append(f"商业矩阵不完整：缺失 {business_missing} 个平台维度单元")
        deductions += min(20, 8 + business_missing)
    else:
        passed_checks.append("商业矩阵平台覆盖完整")

    if high_risks:
        failed_checks.append(f"高严重性风险未处理：发现 {len(high_risks)} 个 high 风险")
        deductions += min(30, 15 + len(high_risks) * 5)
    else:
        passed_checks.append("未发现必须打回的高严重性风险")

    quality_score = max(0, min(100, 100 - deductions))
    status = "rejected" if failed_checks else "approved"
    result = {
        "status": status,
        "reason": "质检通过，证据链、矩阵完整性和风险水位满足进入策略生成要求。" if status == "approved" else "；".join(failed_checks),
        "quality_score": quality_score,
        "passed_checks": passed_checks,
        "failed_checks": failed_checks,
    }

    if status == "rejected":
        target_agent, required_fix = _target_for_failures(failed_checks)
        result["target_agent"] = target_agent
        result["required_fix"] = required_fix
    return result


def _build_prompt(state: CompetitiveAnalysisState, local_result: Dict[str, Any]) -> str:
    payload = {
        "product_matrix": state.get("product_matrix", {}),
        "business_matrix": state.get("business_matrix", {}),
        "evidence_list": state.get("evidence_list", []),
        "risk_flags": state.get("risk_flags", []),
        "local_quality_result": local_result,
    }
    return f"""
你是 QualityAgent，负责对长视频竞品分析结果做严格质检，并决定是否打回重做。

检查项：
1. 每条关键结论是否有证据ID支撑
2. 是否有高可信度证据支撑核心结论
3. 各平台分析是否均衡完整
4. 高严重性风险是否需要打回重做

请只输出 JSON 对象，不要输出 Markdown 或解释文字。格式必须为：
{{
  "status": "approved 或 rejected",
  "reason": "质检结论说明",
  "target_agent": "EvidenceAgent/ProductAgent/BusinessAgent/ResearchAgent",
  "required_fix": "具体修复要求",
  "quality_score": 0到100的整数,
  "passed_checks": ["通过的检查项"],
  "failed_checks": ["未通过的检查项"]
}}

打回规则：
- 证据不足：target_agent=EvidenceAgent
- 产品矩阵有问题：target_agent=ProductAgent
- 商业矩阵有问题：target_agent=BusinessAgent
- 原始数据不足：target_agent=ResearchAgent

输入数据：
{json.dumps(payload, ensure_ascii=False)}
""".strip()


def _extract_quality_object(payload: Any) -> Dict[str, Any]:
    if payload is None:
        return {}
    if isinstance(payload, str):
        return _extract_quality_object(_parse_response(payload))
    if isinstance(payload, dict):
        for key in ("quality_result", "quality", "result", "data"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                return nested
        return payload
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                return item
    return {}


def _normalize_quality_result(payload: Any) -> Dict[str, Any]:
    item = _extract_quality_object(payload)
    if not item:
        return {}

    status = _as_text(item.get("status")).lower()
    if "reject" in status or "打回" in status or "不通过" in status:
        status = "rejected"
    elif "approve" in status or "通过" in status:
        status = "approved"
    elif status not in VALID_STATUSES:
        status = "approved"

    target_agent = _as_text(item.get("target_agent") or item.get("targetAgent"))
    if target_agent not in VALID_TARGET_AGENTS:
        target_agent = ""

    result = {
        "status": status,
        "reason": _as_text(item.get("reason") or item.get("summary")) or "LLM 质检未给出详细说明",
        "quality_score": _coerce_score(item.get("quality_score") or item.get("qualityScore"), 70),
        "passed_checks": _as_list(item.get("passed_checks") or item.get("passedChecks")),
        "failed_checks": _as_list(item.get("failed_checks") or item.get("failedChecks")),
    }

    if status == "rejected":
        result["target_agent"] = target_agent or "EvidenceAgent"
        result["required_fix"] = _as_text(item.get("required_fix") or item.get("requiredFix")) or "补充证据并重新运行相关分析 Agent。"
    return result


def _generate_with_llm(
    llm: ChatOpenAI | None,
    state: CompetitiveAnalysisState,
    local_result: Dict[str, Any],
) -> Dict[str, Any]:
    if llm is None:
        return {}
    response = llm.invoke(_build_prompt(state, local_result))
    return _normalize_quality_result(_parse_response(_response_to_text(response)))


def _merge_quality_results(local_result: Dict[str, Any], llm_result: Dict[str, Any]) -> Dict[str, Any]:
    if local_result.get("status") == "rejected":
        if llm_result.get("reason"):
            local_result = {**local_result, "reason": f"{local_result['reason']}；LLM复核：{llm_result['reason']}"}
        return local_result

    if llm_result.get("status") == "rejected":
        return llm_result

    if llm_result.get("status") == "approved":
        return {
            **local_result,
            "reason": llm_result.get("reason") or local_result.get("reason", ""),
            "quality_score": min(local_result.get("quality_score", 100), llm_result.get("quality_score", 100)),
            "passed_checks": list(dict.fromkeys([*local_result.get("passed_checks", []), *llm_result.get("passed_checks", [])])),
            "failed_checks": list(dict.fromkeys([*local_result.get("failed_checks", []), *llm_result.get("failed_checks", [])])),
        }
    return local_result


def _forced_approval_result(iteration: int) -> Dict[str, Any]:
    return {
        "status": "approved",
        "reason": f"已达到最大重做次数({MAX_ITERATIONS})，为防止无限循环强制通过；当前 iteration_count={iteration}。",
        "quality_score": 60,
        "passed_checks": ["防无限循环检查"],
        "failed_checks": ["达到最大重做次数，仍存在未完全修复的问题"],
    }


def quality_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """Run quality checks and set approval or a concrete rejection target."""
    _load_env()
    iteration = int(state.get("iteration_count", 0) or 0)
    error_log = list(state.get("error_log", []))

    if iteration >= MAX_ITERATIONS:
        quality_result = _forced_approval_result(iteration)
        print(f"[QualityAgent] 质检完成：approved，得分 {quality_result['quality_score']}")
        return {
            **state,
            "current_agent": "QualityAgent",
            "quality_result": quality_result,
            "is_approved": True,
            "error_log": error_log,
        }

    local_result = _local_quality_result(state)
    llm: ChatOpenAI | None = None
    if not _llm_enabled():
        error_log.append("QualityAgent 已按 QUALITY_AGENT_USE_LLM 配置跳过 LLM 调用，使用兜底质检规则。")
    elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = get_llm()
        except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
            error_log.append(f"QualityAgent 初始化 LLM 失败：{exc}")
    else:
        error_log.append("QualityAgent 未找到 ARK_EP 或 ARK_API_KEY，已启用兜底质检规则。")

    try:
        llm_result = _generate_with_llm(llm, state, local_result)
        quality_result = _merge_quality_results(local_result, llm_result)
    except Exception as exc:
        error_log.append(f"QualityAgent 质检失败：{exc}")
        quality_result = local_result

    is_approved = quality_result.get("status") == "approved"
    rejected_agents = list(state.get("rejected_agents", []))
    target_agent = quality_result.get("target_agent")
    if not is_approved and target_agent:
        rejected_agents.append(target_agent)

    print(
        f"[QualityAgent] 质检完成：{quality_result.get('status')}，"
        f"得分 {quality_result.get('quality_score')}"
    )
    return {
        **state,
        "current_agent": "QualityAgent",
        "quality_result": quality_result,
        "is_approved": is_approved,
        "iteration_count": iteration + 1,
        "rejected_agents": rejected_agents,
        "error_log": error_log,
    }


def quality_router(state: CompetitiveAnalysisState) -> str:
    """Route approved states to strategy_agent, otherwise back to the target node."""
    quality_result = state.get("quality_result", {})
    if state.get("is_approved") or quality_result.get("status") == "approved":
        return "strategy_agent"

    target_agent = quality_result.get("target_agent", "")
    return ROUTER_MAP.get(target_agent, "strategy_agent")
