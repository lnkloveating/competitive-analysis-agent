"""Research Agent - collect simulated public competitive intelligence."""

from __future__ import annotations

import ast
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import quote_plus

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from .industry_config import (
    get_state_data_sources,
    get_state_dimensions,
    get_state_industry_name,
)
from .state import CompetitiveAnalysisState


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
REQUIRED_FIELDS = (
    "platform",
    "dimension",
    "content",
    "source_type",
    "source_url",
    "publish_time",
)

VALID_SOURCE_TYPES = {"official", "news", "review", "report", "user_survey"}


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("RESEARCH_AGENT_USE_LLM", "1").strip().lower()
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


def _get_platforms(state: CompetitiveAnalysisState) -> List[str]:
    platforms: List[str] = []
    for platform in [state.get("target_platform", ""), *state.get("competitors", [])]:
        if platform and platform not in platforms:
            platforms.append(platform)
    return platforms


def _build_prompt(state: CompetitiveAnalysisState, platform: str) -> str:
    industry_name = get_state_industry_name(state)
    dimensions = get_state_dimensions(state)
    data_sources = get_state_data_sources(state)
    source_types = [source_type for source_type in data_sources if source_type in VALID_SOURCE_TYPES]
    source_text = "\n".join(
        f"- {source_type}: {data_sources[source_type]}" for source_type in source_types
    )
    return f"""
你是 ResearchAgent，正在为{industry_name}赛道竞品战略分析做公开信息采集模拟。

重要约束：
- 当前没有接入真实搜索 API，请围绕以下公开来源类型模拟采集：
{source_text}
- 只分析一个品牌或产品线：{platform}
- 时间范围：{state.get("time_range", "")}
- 分析场景：{state.get("analysis_scene", "")}
- 目标用户：{state.get("target_user", "")}
- 关注维度：{", ".join(dimensions)}

请输出 JSON 数组，不要输出 Markdown，不要输出解释文字。
数组中每条数据必须包含以下字段：
- platform: 平台名称，固定为 "{platform}"
- dimension: 维度，必须来自关注维度
- content: 80-160 字中文采集摘要，写清楚观察到的竞争动作或趋势
- source_type: 只能是 {", ".join(source_types)}
- source_url: 对应来源 URL，可以使用品牌官网、产品页、新闻、评测、报告或用户口碑页面
- publish_time: 发布时间；如果模拟来源无法精确到日期，可写 "{state.get("time_range", "")}"

每个关注维度至少返回 1 条，总条数控制在 {max(len(dimensions), 3)} 到 {max(len(dimensions) + 2, 5)} 条。
""".strip()


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


def parse_llm_json(text: str) -> Any:
    """Parse unstable LLM JSON output from raw text, code fences, or nested blocks."""
    for candidate in _json_candidates(text):
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed
    return None


def _extract_records(payload: Any) -> List[Any]:
    if payload is None:
        return []

    if isinstance(payload, str):
        return _extract_records(parse_llm_json(payload))

    if isinstance(payload, list):
        records: List[Any] = []
        for item in payload:
            if isinstance(item, (list, str)):
                records.extend(_extract_records(item))
            elif isinstance(item, dict) and not _looks_like_record(item):
                nested = _extract_records_from_dict(item)
                records.extend(nested or [item])
            else:
                records.append(item)
        return records

    if isinstance(payload, dict):
        if _looks_like_record(payload):
            return [payload]
        return _extract_records_from_dict(payload)

    return []


def _extract_records_from_dict(payload: Dict[str, Any]) -> List[Any]:
    preferred_keys = (
        "raw_research",
        "research",
        "records",
        "items",
        "data",
        "results",
        "sources",
        "evidence",
    )
    for key in preferred_keys:
        if key in payload:
            records = _extract_records(payload[key])
            if records:
                return records

    records: List[Any] = []
    for value in payload.values():
        nested = _extract_records(value)
        records.extend(nested)
    return records


def _looks_like_record(payload: Dict[str, Any]) -> bool:
    record_keys = {
        "platform",
        "dimension",
        "content",
        "summary",
        "source_type",
        "source_url",
        "publish_time",
        "url",
    }
    return bool(record_keys.intersection(payload.keys()))


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False)


def _infer_source_type(record: Dict[str, Any]) -> str:
    source_type = _as_text(record.get("source_type") or record.get("sourceType")).lower()
    source_name = _as_text(record.get("source") or record.get("source_name") or record.get("sourceName")).lower()
    source_url = _as_text(record.get("source_url") or record.get("url") or record.get("link")).lower()
    combined = f"{source_type} {source_name} {source_url}"

    if "survey" in combined or "调研" in combined or "论坛" in combined or "社区" in combined:
        return "user_survey"
    if "review" in combined or "评测" in combined or "评论" in combined or "app" in combined:
        return "review"
    if "财报" in combined or "financial" in combined or "investor" in combined or "ir." in combined or "report" in combined:
        return "report"
    if "新闻" in combined or "news" in combined or "press" in combined:
        return "news"
    if source_type in VALID_SOURCE_TYPES:
        return source_type
    return "official"


def _source_url_for(
    platform: str,
    source_type: str,
    state: CompetitiveAnalysisState | None = None,
) -> str:
    industry_name = get_state_industry_name(state or {})
    data_sources = get_state_data_sources(state or {})
    source_label = data_sources.get(source_type, source_type)
    query = quote_plus(f"{platform} {industry_name} {source_label}")
    return f"https://www.google.com/search?q={query}"


def _normalize_record(
    item: Any,
    platform: str,
    dimensions: List[str],
    time_range: str,
    state: CompetitiveAnalysisState,
) -> Dict[str, str] | None:
    if not isinstance(item, dict):
        content = _as_text(item)
        if not content:
            return None
        return {
            "platform": platform,
            "dimension": dimensions[0] if dimensions else "综合竞争情报",
            "content": content,
            "source_type": "news",
            "source_url": _source_url_for(platform, "news", state),
            "publish_time": time_range,
        }

    source_type = _infer_source_type(item)
    content = _as_text(
        item.get("content")
        or item.get("summary")
        or item.get("description")
        or item.get("insight")
        or item.get("finding")
        or item.get("title")
    )
    if not content:
        return None

    dimension = _as_text(
        item.get("dimension")
        or item.get("focus_dimension")
        or item.get("category")
        or item.get("topic")
    )
    if not dimension:
        dimension = dimensions[0] if dimensions else "综合竞争情报"

    normalized = {
        "platform": _as_text(item.get("platform")) or platform,
        "dimension": dimension,
        "content": content,
        "source_type": source_type,
        "source_url": _as_text(
            item.get("source_url")
            or item.get("sourceUrl")
            or item.get("url")
            or item.get("link")
            or item.get("source_link")
        )
        or _source_url_for(platform, source_type, state),
        "publish_time": _as_text(
            item.get("publish_time")
            or item.get("publishTime")
            or item.get("published_at")
            or item.get("date")
            or item.get("time")
        )
        or time_range,
    }
    return {field: normalized[field] for field in REQUIRED_FIELDS}


def _normalize_records(
    records: List[Any],
    platform: str,
    state: CompetitiveAnalysisState,
) -> List[Dict[str, str]]:
    dimensions = get_state_dimensions(state)
    time_range = state.get("time_range", "")
    normalized = []
    for item in records:
        record = _normalize_record(item, platform, dimensions, time_range, state)
        if record:
            normalized.append(record)
    return normalized


def _fallback_records(
    platform: str,
    state: CompetitiveAnalysisState,
    reason: str = "LLM 输出解析失败",
) -> List[Dict[str, str]]:
    industry_name = get_state_industry_name(state)
    dimensions = get_state_dimensions(state)
    data_sources = get_state_data_sources(state)
    source_cycle = [source_type for source_type in data_sources if source_type in VALID_SOURCE_TYPES]
    if not source_cycle:
        source_cycle = ["official", "news", "review", "report"]
    source_labels = {
        "official": "官网",
        "news": "新闻",
        "review": "评测与用户评论",
        "report": "报告",
        "user_survey": "用户调研",
    }
    source_summary = "、".join(
        source_labels.get(source_type, data_sources.get(source_type, source_type))
        for source_type in source_cycle[:4]
    )
    records = []

    for index, dimension in enumerate(dimensions):
        source_type = source_cycle[index % len(source_cycle)]
        records.append(
            {
                "platform": platform,
                "dimension": dimension,
                "content": (
                    f"{platform}在“{dimension}”维度的模拟公开信息：围绕"
                    f"{state.get('analysis_scene') or industry_name + '竞品分析'}，结合"
                    f"{state.get('time_range', '近期')}内{source_summary}等公开口径，"
                    f"重点观察产品能力、用户反馈、价格策略和市场表现变化。兜底原因：{reason}。"
                ),
                "source_type": source_type,
                "source_url": _source_url_for(platform, source_type, state),
                "publish_time": state.get("time_range", ""),
            }
        )
    return records


def _collect_platform_research(
    llm: ChatOpenAI | None,
    platform: str,
    state: CompetitiveAnalysisState,
    fallback_reason: str = "未配置 ARK_EP 或 ARK_API_KEY",
) -> List[Dict[str, str]]:
    if llm is None:
        return _fallback_records(platform, state, fallback_reason)

    prompt = _build_prompt(state, platform)
    response = llm.invoke(prompt)
    text = _response_to_text(response)
    parsed = parse_llm_json(text)
    records = _normalize_records(_extract_records(parsed), platform, state)

    if not records:
        return _fallback_records(platform, state, "LLM 未返回可解析 JSON")
    return records


def research_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """Collect one platform at a time and write standardized raw_research records."""
    _load_env()
    error_log = list(state.get("error_log", []))
    raw_research: List[Dict[str, str]] = []
    platforms = _get_platforms(state)

    llm: ChatOpenAI | None = None
    fallback_reason = "未配置 ARK_EP 或 ARK_API_KEY"
    if not _llm_enabled():
        fallback_reason = "已按 RESEARCH_AGENT_USE_LLM 配置跳过 LLM 调用"
        error_log.append("ResearchAgent 已按 RESEARCH_AGENT_USE_LLM 配置跳过 LLM 调用，使用兜底模拟数据。")
    elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = get_llm()
        except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
            error_log.append(f"ResearchAgent 初始化 LLM 失败：{exc}")
            fallback_reason = f"LLM 初始化失败：{exc}"
    else:
        error_log.append("ResearchAgent 未找到 ARK_EP 或 ARK_API_KEY，已启用兜底模拟数据。")

    for platform in platforms:
        try:
            platform_records = _collect_platform_research(llm, platform, state, fallback_reason)
        except Exception as exc:
            error_log.append(f"ResearchAgent 采集 {platform} 失败：{exc}")
            platform_records = _fallback_records(platform, state, str(exc))
        raw_research.extend(platform_records)

    print(f"[ResearchAgent] 采集完成，共 {len(raw_research)} 条原始研究数据")
    return {
        **state,
        "current_agent": "ResearchAgent",
        "raw_research": raw_research,
        "error_log": error_log,
    }
