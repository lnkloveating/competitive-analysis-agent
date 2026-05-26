"""Risk Agent - identify data quality, evidence gap, and compliance risks."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, Iterable, List

from app.schemas.risk import RiskAgentOutput, RiskFlag


MATRIX_NAMES = ("product_matrix", "business_matrix")
COMPLIANCE_KEYWORDS = (
    "用户名",
    "user_id",
    "profile",
    "头像",
    "主页",
    "email",
    "手机号",
)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value)


def _dimension_key(value: Any) -> str:
    return re.sub(r"[\s_\-]+", "", _as_text(value).lower())


def _risk_id(index: int) -> str:
    return f"R{index:03d}"


def _evidence_id(value: Any) -> str:
    text = _as_text(value)
    return text if re.fullmatch(r"EV\d{3,}", text) else ""


def _evidence_ids(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        candidates = re.findall(r"EV\d{3,}", value)
    elif isinstance(value, list):
        candidates = [_evidence_id(item) for item in value]
    else:
        candidates = [_evidence_id(value)]

    result: List[str] = []
    for evidence_id in candidates:
        if evidence_id and evidence_id not in result:
            result.append(evidence_id)
    return result


def _evidence_map(evidence_list: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {
        _as_text(item.get("evidence_id")): item
        for item in evidence_list
        if isinstance(item, dict) and item.get("evidence_id")
    }


def _platforms_in_evidence(evidence_list: List[Dict[str, Any]]) -> set[str]:
    return {
        _as_text(item.get("platform"))
        for item in evidence_list
        if isinstance(item, dict) and _as_text(item.get("platform"))
    }


def _dimensions_in_evidence(evidence_list: List[Dict[str, Any]]) -> set[str]:
    return {
        _dimension_key(
            item.get("related_dimension")
            or item.get("dimension")
            or item.get("topic")
        )
        for item in evidence_list
        if isinstance(item, dict)
        and _dimension_key(
            item.get("related_dimension")
            or item.get("dimension")
            or item.get("topic")
        )
    }


def _matrix_cells(
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
) -> Iterable[tuple[str, str, Dict[str, Any]]]:
    for matrix in (product_matrix, business_matrix):
        if not isinstance(matrix, dict):
            continue
        dimensions = matrix.get("dimensions", {})
        if not isinstance(dimensions, dict):
            continue
        for dimension, platform_map in dimensions.items():
            if not isinstance(platform_map, dict):
                continue
            for platform, cell in platform_map.items():
                yield (
                    _as_text(platform),
                    _as_text(dimension),
                    cell if isinstance(cell, dict) else {},
                )


def _parse_publish_time(value: Any) -> datetime | None:
    text = _as_text(value)
    if not text:
        return None
    if re.search(r"近|最近|过去|within|last", text, re.IGNORECASE):
        return None

    patterns = (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%Y-%m",
        "%Y/%m",
        "%Y.%m",
    )
    for pattern in patterns:
        try:
            return datetime.strptime(text, pattern)
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


def _years_old(publish_time: Any, now: datetime) -> float | None:
    parsed = _parse_publish_time(publish_time)
    if parsed is None:
        return None
    return (now - parsed).days / 365


def _risk(
    risk_type: str,
    description: str,
    severity: str,
    related_platforms: List[str] | None = None,
    related_dimensions: List[str] | None = None,
    related_evidence_ids: List[str] | None = None,
    suggestion: str | None = None,
) -> Dict[str, Any]:
    related_platforms = list(dict.fromkeys(related_platforms or []))
    related_dimensions = list(dict.fromkeys(related_dimensions or []))
    related_evidence_ids = list(dict.fromkeys(related_evidence_ids or []))

    flag = RiskFlag(
        risk_type=risk_type,
        description=description,
        severity=severity,
        related_platforms=related_platforms,
        related_dimensions=related_dimensions,
    ).model_dump()
    flag.update(
        {
            "affected_platform": related_platforms[0] if len(related_platforms) == 1 else "多个平台" if related_platforms else "",
            "affected_dimension": related_dimensions[0] if len(related_dimensions) == 1 else "多个维度" if related_dimensions else "",
            "suggestion": suggestion or "补充可追溯证据，并在最终报告中标注置信度与限制。",
            "related_evidence_ids": related_evidence_ids,
        }
    )
    return flag


def _credibility_risks(
    evidence_list: List[Dict[str, Any]],
    claims: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    risks: List[Dict[str, Any]] = []
    if not evidence_list:
        return risks

    low_items = [
        item
        for item in evidence_list
        if _as_text(item.get("credibility")).lower() == "low"
    ]
    low_ratio = len(low_items) / len(evidence_list)
    if low_ratio >= 0.3:
        severity = "high" if low_ratio >= 0.5 else "medium"
        risks.append(
            _risk(
                risk_type="data_credibility",
                description=f"low credibility 证据占比达到 {low_ratio:.0%}，可能影响核心结论可靠性。",
                severity=severity,
                related_platforms=[_as_text(item.get("platform")) for item in low_items],
                related_dimensions=[
                    _as_text(item.get("related_dimension") or item.get("dimension"))
                    for item in low_items
                ],
                related_evidence_ids=[
                    _as_text(item.get("evidence_id"))
                    for item in low_items
                    if item.get("evidence_id")
                ],
                suggestion="优先补充 official、report 或权威新闻来源，降低低可信证据权重。",
            )
        )

    evidence_by_id = _evidence_map(evidence_list)
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        claim_evidence_ids = _evidence_ids(claim.get("evidence_ids"))
        if not claim_evidence_ids:
            continue
        related_evidence = [
            evidence_by_id[evidence_id]
            for evidence_id in claim_evidence_ids
            if evidence_id in evidence_by_id
        ]
        if related_evidence and all(
            _as_text(evidence.get("credibility")).lower() == "low"
            for evidence in related_evidence
        ):
            risks.append(
                _risk(
                    risk_type="data_credibility",
                    description="部分 claim 仅由 low credibility evidence 支撑，建议补充更高可信来源。",
                    severity="medium",
                    related_platforms=[
                        _as_text(platform)
                        for platform in claim.get("related_platforms", [])
                        if _as_text(platform)
                    ],
                    related_dimensions=[_as_text(claim.get("dimension"))] if claim.get("dimension") else [],
                    related_evidence_ids=claim_evidence_ids,
                    suggestion="补充高可信来源后再用于策略结论。",
                )
            )
    return risks


def _timeliness_risks(evidence_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    risks: List[Dict[str, Any]] = []
    if not evidence_list:
        return risks

    missing_time_items = [
        item
        for item in evidence_list
        if not _as_text(item.get("publish_time"))
    ]
    missing_ratio = len(missing_time_items) / len(evidence_list)
    if missing_ratio >= 0.5:
        risks.append(
            _risk(
                risk_type="data_timeliness",
                description=f"{len(missing_time_items)} 条证据缺少 publish_time，难以判断数据时效性。",
                severity="high" if missing_ratio >= 0.8 else "medium",
                related_platforms=[_as_text(item.get("platform")) for item in missing_time_items],
                related_dimensions=[
                    _as_text(item.get("related_dimension") or item.get("dimension"))
                    for item in missing_time_items
                ],
                related_evidence_ids=[
                    _as_text(item.get("evidence_id"))
                    for item in missing_time_items
                    if item.get("evidence_id")
                ],
                suggestion="补齐发布时间或采集时间，并优先采用近 12 个月公开来源。",
            )
        )

    now = datetime.now()
    stale_medium: List[Dict[str, Any]] = []
    stale_high: List[Dict[str, Any]] = []
    for item in evidence_list:
        age = _years_old(item.get("publish_time"), now)
        if age is None:
            continue
        if age > 3:
            stale_high.append(item)
        elif age > 2:
            stale_medium.append(item)

    for severity, items in (("high", stale_high), ("medium", stale_medium)):
        if not items:
            continue
        risks.append(
            _risk(
                risk_type="data_timeliness",
                description=(
                    "部分证据发布时间超过 "
                    f"{'3' if severity == 'high' else '2'} 年，可能无法反映当前竞争态势。"
                ),
                severity=severity,
                related_platforms=[_as_text(item.get("platform")) for item in items],
                related_dimensions=[
                    _as_text(item.get("related_dimension") or item.get("dimension"))
                    for item in items
                ],
                related_evidence_ids=[
                    _as_text(item.get("evidence_id"))
                    for item in items
                    if item.get("evidence_id")
                ],
                suggestion="补充近期官方、评测、新闻或电商来源。",
            )
        )
    return risks


def _evidence_gap_risks(
    evidence_list: List[Dict[str, Any]],
    product_matrix: Dict[str, Any],
    business_matrix: Dict[str, Any],
    competitors: List[str],
    focus_dimensions: List[str],
) -> List[Dict[str, Any]]:
    risks: List[Dict[str, Any]] = []
    platforms_in_evidence = _platforms_in_evidence(evidence_list)
    dimensions_in_evidence = _dimensions_in_evidence(evidence_list)

    missing_platforms = [
        platform
        for platform in competitors
        if _as_text(platform) and _as_text(platform) not in platforms_in_evidence
    ]
    if missing_platforms:
        risks.append(
            _risk(
                risk_type="evidence_gap",
                description=f"{'、'.join(missing_platforms)} 缺少可用 evidence，平台覆盖不足。",
                severity="medium",
                related_platforms=missing_platforms,
                related_dimensions=[],
                suggestion="为缺失竞品补充至少一条可追溯公开来源。",
            )
        )

    missing_dimensions = [
        dimension
        for dimension in focus_dimensions
        if _as_text(dimension) and _dimension_key(dimension) not in dimensions_in_evidence
    ]
    if missing_dimensions:
        risks.append(
            _risk(
                risk_type="evidence_gap",
                description=f"{'、'.join(missing_dimensions)} 缺少可用 evidence，维度覆盖不足。",
                severity="medium",
                related_platforms=[],
                related_dimensions=missing_dimensions,
                suggestion="为缺失维度补充公开材料后再生成矩阵结论。",
            )
        )

    for platform, dimension, cell in _matrix_cells(product_matrix, business_matrix):
        evidence_ids = _evidence_ids(cell.get("evidence_ids") or cell.get("evidenceIds"))
        if evidence_ids:
            continue
        risks.append(
            _risk(
                risk_type="evidence_gap",
                description=f"{platform} 在 {dimension} 维度的矩阵结论缺少 evidence_ids。",
                severity="low",
                related_platforms=[platform] if platform else [],
                related_dimensions=[dimension] if dimension else [],
                suggestion="补齐该矩阵单元的 evidence_ids，或标记为 evidence_gap。",
            )
        )
    return risks


def _compliance_risks(evidence_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    risks: List[Dict[str, Any]] = []
    for item in evidence_list:
        if not isinstance(item, dict):
            continue
        if _as_text(item.get("source_type")).lower() != "user_review":
            continue
        raw_content = _as_text(item.get("raw_content") or item.get("content"))
        has_keyword = any(keyword.lower() in raw_content.lower() for keyword in COMPLIANCE_KEYWORDS)
        has_email = bool(re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", raw_content))
        has_phone = bool(re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", raw_content))
        if not (has_keyword or has_email or has_phone):
            continue

        risks.append(
            _risk(
                risk_type="compliance",
                description="user_review 来源内容疑似包含用户个人信息，存在合规风险。",
                severity="high" if has_email or has_phone else "medium",
                related_platforms=[_as_text(item.get("platform"))] if item.get("platform") else [],
                related_dimensions=[
                    _as_text(item.get("related_dimension") or item.get("dimension"))
                ]
                if item.get("related_dimension") or item.get("dimension")
                else [],
                related_evidence_ids=[_as_text(item.get("evidence_id"))] if item.get("evidence_id") else [],
                suggestion="脱敏或移除个人信息，并确认数据采集和使用范围符合合规要求。",
            )
        )
    return risks


def _dedupe_and_number(risks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...], tuple[str, ...]]] = set()

    for risk in risks:
        key = (
            _as_text(risk.get("risk_type")),
            _as_text(risk.get("description")),
            tuple(risk.get("related_platforms") or []),
            tuple(risk.get("related_dimensions") or []),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(risk)

    for index, risk in enumerate(deduped, start=1):
        risk["risk_id"] = _risk_id(index)
    return deduped


def _append_trace(state: dict, risk_flags: List[Dict[str, Any]]) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "RiskAgent",
            "status": "success",
            "output_summary": f"identified {len(risk_flags)} risk flags",
            "error": None,
        }
    )


def risk_agent(state: dict) -> Dict[str, Any]:
    """Identify risk flags without creating evidence, claims, or final decisions."""
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
    competitors = [
        _as_text(item) for item in state.get("competitors", [])
        if _as_text(item)
    ]
    focus_dimensions = [
        _as_text(item) for item in state.get("focus_dimensions", [])
        if _as_text(item)
    ]

    raw_risks: List[Dict[str, Any]] = []
    raw_risks.extend(_credibility_risks(evidence_list, claims))
    raw_risks.extend(_timeliness_risks(evidence_list))
    raw_risks.extend(
        _evidence_gap_risks(
            evidence_list=evidence_list,
            product_matrix=product_matrix if isinstance(product_matrix, dict) else {},
            business_matrix=business_matrix if isinstance(business_matrix, dict) else {},
            competitors=competitors,
            focus_dimensions=focus_dimensions,
        )
    )
    raw_risks.extend(_compliance_risks(evidence_list))

    risk_flags = _dedupe_and_number(raw_risks)
    RiskAgentOutput(
        risk_flags=[RiskFlag.model_validate(item) for item in risk_flags]
    )

    next_state = {
        **state,
        "current_agent": "RiskAgent",
        "risk_flags": risk_flags,
    }
    _append_trace(next_state, risk_flags)

    print(f"[RiskAgent] 风险识别完成，共 {len(risk_flags)} 条风险")
    return next_state
