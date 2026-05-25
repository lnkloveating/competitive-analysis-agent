from __future__ import annotations

import ast
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, List
from urllib.parse import quote

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from agents.industry_config import (
    get_state_data_sources,
    get_state_dimensions,
    get_state_industry_name,
)
from app.schemas.research import RawResearchItem
from app.services.research_provider import ResearchProvider


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
SCHEMA_SOURCE_TYPES = {"official", "news", "review", "report", "ecommerce", "user_review", "mock"}


class MockResearchProvider(ResearchProvider):
    """Collect LLM-generated or deterministic mock research records."""

    def collect(self, state: dict) -> List[RawResearchItem]:
        _load_env()
        platforms = _get_platforms(state)
        collected_time = datetime.now().isoformat(timespec="seconds")
        records: List[dict[str, Any]] = []

        llm = None
        fallback_reason = "未配置 ARK_EP 或 ARK_API_KEY"
        if not _llm_enabled():
            fallback_reason = "已按 RESEARCH_AGENT_USE_LLM 配置跳过 LLM 调用"
        elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
            try:
                llm = _get_llm()
            except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
                fallback_reason = f"LLM 初始化失败：{exc}"

        for platform in platforms:
            platform_records = self._collect_platform(
                llm=llm,
                platform=platform,
                state=state,
                collected_time=collected_time,
                fallback_reason=fallback_reason,
            )
            records.extend(platform_records)

        return [
            _to_raw_research_item(item=item, index=index, collected_time=collected_time)
            for index, item in enumerate(records, start=1)
        ]

    def _collect_platform(
        self,
        llm: ChatOpenAI | None,
        platform: str,
        state: dict,
        collected_time: str,
        fallback_reason: str,
    ) -> List[dict[str, Any]]:
        if llm is None:
            return _fallback_records(platform, state, fallback_reason, collected_time)

        try:
            response = llm.invoke(_build_prompt(state, platform))
            parsed = _parse_json(_response_to_text(response))
            records = _normalize_records(_extract_records(parsed), platform, state, collected_time)
            return records or _fallback_records(platform, state, "LLM 未返回可解析 JSON", collected_time)
        except Exception as exc:
            return _fallback_records(platform, state, f"LLM 调用失败：{exc}", collected_time)


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("RESEARCH_AGENT_USE_LLM", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("ARK_EP", ""),
        api_key=os.getenv("ARK_API_KEY", ""),
        base_url=BASE_URL,
        temperature=0.2,
        timeout=60,
        max_retries=0,
    )


def _get_platforms(state: dict) -> List[str]:
    platforms: List[str] = []
    for platform in [state.get("target_platform", ""), *state.get("competitors", [])]:
        if platform and platform not in platforms:
            platforms.append(platform)
    return platforms


def _build_prompt(state: dict, platform: str) -> str:
    industry_name = get_state_industry_name(state)
    dimensions = get_state_dimensions(state)
    data_sources = get_state_data_sources(state)
    source_types = [
        _canonical_source_type(source_type)
        for source_type in data_sources
        if _canonical_source_type(source_type) in SCHEMA_SOURCE_TYPES
    ]
    source_types = list(dict.fromkeys(source_types)) or ["official", "news", "review", "report"]

    return f"""
你是 ResearchAgent 的 MockResearchProvider，正在为{industry_name}赛道生成可替换为真实爬虫的 mock 公开材料。

请只输出 JSON 数组，不要输出 Markdown 或解释文字。
每条记录必须包含：
- platform: 固定为 "{platform}"
- dimension: 必须来自关注维度
- raw_content: 80-160 字中文材料摘要，写清楚观察到的竞争动作或趋势
- source_type: 只能是 {", ".join(source_types)}
- source_title: 来源标题
- source_url: 可以使用真实 URL 或 mock:// 开头的模拟 URL
- publish_time: 发布时间；无法精确时写 "{state.get("time_range", "")}"

时间范围：{state.get("time_range", "")}
分析场景：{state.get("analysis_scene", "")}
目标用户：{state.get("target_user", "")}
关注维度：{", ".join(dimensions)}
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


def _json_candidates(text: str) -> Iterable[str]:
    cleaned = text.strip()
    fence_match = re.fullmatch(r"```(?:json|JSON)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fence_match:
        yield fence_match.group(1).strip()
    yield cleaned

    for block in re.findall(r"```(?:json|JSON)?\s*(.*?)\s*```", text, re.DOTALL):
        yield block.strip()

    array_match = re.search(r"\[.*\]", text, re.DOTALL)
    if array_match:
        yield array_match.group(0)


def _parse_json(text: str) -> Any:
    for candidate in _json_candidates(text):
        normalized = re.sub(r",\s*([}\]])", r"\1", candidate.strip().lstrip("\ufeff"))
        try:
            return json.loads(normalized)
        except json.JSONDecodeError:
            try:
                return ast.literal_eval(normalized)
            except (SyntaxError, ValueError):
                continue
    return None


def _extract_records(payload: Any) -> List[Any]:
    if payload is None:
        return []
    if isinstance(payload, str):
        return _extract_records(_parse_json(payload))
    if isinstance(payload, list):
        records: List[Any] = []
        for item in payload:
            records.extend(_extract_records(item) if isinstance(item, (list, str)) else [item])
        return records
    if isinstance(payload, dict):
        for key in ("raw_research", "research", "records", "items", "data", "results"):
            if key in payload:
                records = _extract_records(payload[key])
                if records:
                    return records
        return [payload]
    return []


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False)


def _canonical_source_type(value: Any) -> str:
    text = _as_text(value).lower()
    if text in SCHEMA_SOURCE_TYPES:
        return text
    if "survey" in text or "调研" in text or "user" in text:
        return "user_review"
    if "commerce" in text or "电商" in text:
        return "ecommerce"
    if "review" in text or "评测" in text or "评论" in text or "app" in text:
        return "review"
    if "financial" in text or "report" in text or "财报" in text or "报告" in text:
        return "report"
    if "news" in text or "press" in text or "新闻" in text:
        return "news"
    if "official" in text or "官网" in text:
        return "official"
    return "mock"


def _normalize_records(
    records: List[Any],
    platform: str,
    state: dict,
    collected_time: str,
) -> List[dict[str, Any]]:
    dimensions = get_state_dimensions(state)
    normalized = []
    for index, item in enumerate(records, start=1):
        if not isinstance(item, dict):
            raw_content = _as_text(item)
            dimension = dimensions[(index - 1) % len(dimensions)] if dimensions else "综合竞争情报"
            item = {"raw_content": raw_content, "dimension": dimension}

        raw_content = _as_text(
            item.get("raw_content")
            or item.get("content")
            or item.get("summary")
            or item.get("description")
            or item.get("title")
        )
        if not raw_content:
            continue

        dimension = _as_text(item.get("dimension") or item.get("focus_dimension"))
        if not dimension:
            dimension = dimensions[(index - 1) % len(dimensions)] if dimensions else "综合竞争情报"

        source_type = _canonical_source_type(item.get("source_type") or item.get("sourceType"))
        normalized.append(
            {
                "platform": _as_text(item.get("platform")) or platform,
                "dimension": dimension,
                "source_type": source_type,
                "source_title": _as_text(item.get("source_title") or item.get("title"))
                or f"{platform}{dimension}模拟公开材料",
                "source_url": _as_text(item.get("source_url") or item.get("url"))
                or _mock_url(platform, index),
                "publish_time": _as_text(item.get("publish_time") or item.get("date"))
                or state.get("time_range", ""),
                "collected_time": collected_time,
                "raw_content": raw_content,
            }
        )
    return normalized


def _fallback_records(
    platform: str,
    state: dict,
    reason: str,
    collected_time: str,
) -> List[dict[str, Any]]:
    dimensions = get_state_dimensions(state)
    industry_name = get_state_industry_name(state)
    source_cycle = ["official", "news", "review", "report"]
    records = []

    for index, dimension in enumerate(dimensions, start=1):
        source_type = source_cycle[(index - 1) % len(source_cycle)]
        raw_content = (
            f"{platform}在“{dimension}”维度的模拟公开材料：围绕"
            f"{state.get('analysis_scene') or industry_name + '竞品分析'}，结合"
            f"{state.get('time_range', '近期')}内官网、新闻、评测与报告等公开口径，"
            f"重点观察产品能力、用户反馈、价格策略和市场表现变化。兜底原因：{reason}。"
        )
        records.append(
            {
                "platform": platform,
                "dimension": dimension,
                "source_type": source_type,
                "source_title": f"{platform}{dimension}模拟公开材料",
                "source_url": _mock_url(platform, index),
                "publish_time": state.get("time_range", ""),
                "collected_time": collected_time,
                "raw_content": raw_content,
            }
        )
    return records


def _mock_url(platform: str, index: int) -> str:
    return f"mock://{quote(platform, safe='')}/{index:03d}"


def _to_raw_research_item(
    item: dict[str, Any],
    index: int,
    collected_time: str,
) -> RawResearchItem:
    raw_content = _as_text(item.get("raw_content"))
    dimension = _as_text(item.get("dimension")) or "综合竞争情报"
    platform = _as_text(item.get("platform")) or "未知平台"
    source_type = _canonical_source_type(item.get("source_type"))

    return RawResearchItem(
        item_id=_as_text(item.get("item_id")) or f"RR{index:03d}",
        platform=platform,
        source_type=source_type,
        source_title=_as_text(item.get("source_title")) or f"{platform}{dimension}模拟公开材料",
        source_url=_as_text(item.get("source_url")) or _mock_url(platform, index),
        publish_time=_as_text(item.get("publish_time")) or None,
        collected_time=_as_text(item.get("collected_time")) or collected_time,
        raw_content=raw_content,
        crawl_method="llm_mock",
        dimension=dimension,
        content=raw_content,
    )
