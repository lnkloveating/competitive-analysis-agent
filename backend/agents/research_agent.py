"""Research Agent - collect simulated public competitive intelligence."""

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
REQUIRED_FIELDS = (
    "platform",
    "dimension",
    "content",
    "source_type",
    "source_url",
    "publish_time",
)

SOURCE_URLS = {
    "腾讯视频": {
        "official": "https://v.qq.com",
        "financial_report": "https://www.tencent.com/zh-cn/investors/financial-reports.html",
        "news": "https://v.qq.com/channel/news",
        "app_store": "https://apps.apple.com/cn/app/id458318329",
    },
    "爱奇艺": {
        "official": "https://www.iqiyi.com",
        "financial_report": "https://ir.iqiyi.com/financial-information/annual-reports",
        "news": "https://www.iqiyi.com/news",
        "app_store": "https://apps.apple.com/cn/app/id393765873",
    },
    "芒果TV": {
        "official": "https://www.mgtv.com",
        "financial_report": "https://www.mgtv.com",
        "news": "https://www.mgtv.com/news",
        "app_store": "https://apps.apple.com/cn/app/id629774477",
    },
    "Netflix": {
        "official": "https://www.netflix.com",
        "financial_report": "https://ir.netflix.net/financials/quarterly-earnings/default.aspx",
        "news": "https://about.netflix.com/newsroom",
        "app_store": "https://apps.apple.com/app/netflix/id363590051",
    },
    "Disney+": {
        "official": "https://www.disneyplus.com",
        "financial_report": "https://thewaltdisneycompany.com/investor-relations/",
        "news": "https://press.disneyplus.com",
        "app_store": "https://apps.apple.com/app/disney/id1446075923",
    },
}


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
    dimensions = state.get("focus_dimensions") or ["内容生态", "会员体系", "商业模式", "推荐系统"]
    return f"""
你是 ResearchAgent，正在为长视频平台竞品战略分析做公开信息采集模拟。

重要约束：
- 当前没有接入真实搜索 API，请模拟从官网、财报、新闻、App Store 四类来源采集。
- 只分析一个平台：{platform}
- 时间范围：{state.get("time_range", "")}
- 分析场景：{state.get("analysis_scene", "")}
- 目标用户：{state.get("target_user", "")}
- 关注维度：{", ".join(dimensions)}

请输出 JSON 数组，不要输出 Markdown，不要输出解释文字。
数组中每条数据必须包含以下字段：
- platform: 平台名称，固定为 "{platform}"
- dimension: 维度，必须来自关注维度
- content: 80-160 字中文采集摘要，写清楚观察到的竞争动作或趋势
- source_type: 只能是 official、financial_report、news、app_store 之一
- source_url: 对应来源 URL，可以使用平台官网、投资者关系、新闻中心或 App Store 页面
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

    if "app" in combined or "itunes.apple" in combined or "apps.apple" in combined:
        return "app_store"
    if "财报" in combined or "financial" in combined or "investor" in combined or "ir." in combined:
        return "financial_report"
    if "新闻" in combined or "news" in combined or "press" in combined:
        return "news"
    if source_type in {"official", "financial_report", "news", "app_store"}:
        return source_type
    return "official"


def _source_url_for(platform: str, source_type: str) -> str:
    platform_sources = SOURCE_URLS.get(platform, {})
    return platform_sources.get(source_type) or platform_sources.get("official") or ""


def _normalize_record(
    item: Any,
    platform: str,
    dimensions: List[str],
    time_range: str,
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
            "source_url": _source_url_for(platform, "news"),
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
        or _source_url_for(platform, source_type),
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
    dimensions = state.get("focus_dimensions") or ["综合竞争情报"]
    time_range = state.get("time_range", "")
    normalized = []
    for item in records:
        record = _normalize_record(item, platform, dimensions, time_range)
        if record:
            normalized.append(record)
    return normalized


def _fallback_records(
    platform: str,
    state: CompetitiveAnalysisState,
    reason: str = "LLM 输出解析失败",
) -> List[Dict[str, str]]:
    dimensions = state.get("focus_dimensions") or ["内容生态", "会员体系", "商业模式", "推荐系统"]
    source_cycle = ["official", "financial_report", "news", "app_store"]
    records = []

    for index, dimension in enumerate(dimensions):
        source_type = source_cycle[index % len(source_cycle)]
        records.append(
            {
                "platform": platform,
                "dimension": dimension,
                "content": (
                    f"{platform}在“{dimension}”维度的模拟公开信息：围绕"
                    f"{state.get('analysis_scene', '长视频平台竞品分析')}，结合"
                    f"{state.get('time_range', '近期')}内官网、财报、新闻与 App Store 口径，"
                    f"重点观察内容供给、会员转化、商业化效率和用户体验变化。兜底原因：{reason}。"
                ),
                "source_type": source_type,
                "source_url": _source_url_for(platform, source_type),
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
