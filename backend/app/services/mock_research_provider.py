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
    get_industry_config,
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
        if state.get("industry_key") == "gaming_mouse":
            return _gaming_mouse_records(platform, state, collected_time)

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


def _gaming_mouse_product(platform: str, state: dict) -> str:
    config = get_industry_config("gaming_mouse")
    products = config.get("representative_products", {})
    if isinstance(products, dict):
        platform_products = products.get(platform)
        if isinstance(platform_products, list) and platform_products:
            return str(platform_products[0])
    fallback_products = {
        "罗技": "G Pro X Superlight 2",
        "雷蛇": "Viper V3 Pro",
        "海盗船": "M75 Air",
    }
    return fallback_products.get(platform, f"{platform}电竞鼠标")


def _gaming_mouse_product_slug(product_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", product_name.lower()).strip("-")


def _gaming_mouse_brand_slug(platform: str) -> str:
    brand_slugs = {
        "罗技": "logitech",
        "雷蛇": "razer",
        "海盗船": "corsair",
    }
    return brand_slugs.get(platform, quote(platform, safe="").lower())


def _gaming_mouse_source_url(platform: str, product_name: str, source_type: str) -> str:
    return (
        f"mock://gaming_mouse/{_gaming_mouse_brand_slug(platform)}/"
        f"{_gaming_mouse_product_slug(product_name)}/{source_type}"
    )


def _gaming_mouse_source_title(platform: str, product_name: str, dimension: str, source_type: str) -> str:
    source_names = {
        "official": "官方产品页",
        "review": "专业评测",
        "ecommerce": "电商页面",
        "user_review": "用户评论",
        "news": "电竞新闻",
        "report": "行业报告",
    }
    return f"{platform} {product_name} {dimension}{source_names.get(source_type, '公开材料')}"


def _gaming_mouse_content(
    platform: str,
    product_name: str,
    dimension: str,
    source_type: str,
    time_range: str,
) -> str:
    content_map = {
        "性能参数": (
            f"{platform} {product_name} 在电竞鼠标性能参数上强调高精度传感器、低延迟无线连接和稳定回报率，"
            f"{source_type} 口径显示其主要面向高水平 FPS 和 MOBA 玩家，适合在{time_range}内追踪与竞品的性能差异。"
        ),
        "轻量化设计": (
            f"{platform} {product_name} 的轻量化设计围绕机身重量、重心控制和长时间握持舒适度展开，"
            f"公开材料关注减重结构、外壳形态和手型适配，对电竞鼠标手感评估具有直接参考价值。"
        ),
        "无线与续航": (
            f"{platform} {product_name} 在无线与续航维度强调低延迟连接、续航时长和充电便利性，"
            f"适合比较高强度训练或赛事场景下的稳定性、断连风险和日常维护成本。"
        ),
        "软件生态": (
            f"{platform} {product_name} 依赖品牌驱动或配置软件管理 DPI、按键映射、宏设置和固件更新，"
            f"软件生态体验会影响玩家调参效率、跨设备同步和对品牌外设组合的粘性。"
        ),
        "用户口碑": (
            f"{platform} {product_name} 的用户口碑集中在手感、重量、续航、按键反馈和品控反馈上，"
            f"用户评论可用于观察电竞鼠标在真实游戏场景中的满意度和常见槽点。"
        ),
        "价格定位": (
            f"{platform} {product_name} 的价格定位偏向中高端电竞鼠标市场，"
            f"需要结合首发价、电商促销价、旗舰竞品价格带和职业玩家背书评估其性价比与品牌溢价。"
        ),
        "电竞品牌影响力": (
            f"{platform} {product_name} 的电竞品牌影响力来自职业战队、主播玩家、赛事曝光和社群讨论，"
            f"这些公开信号能够反映品牌在核心电竞人群中的心智占位和新品扩散效率。"
        ),
    }
    return content_map.get(
        dimension,
        f"{platform} {product_name} 在{dimension}维度存在可用于电竞鼠标竞品分析的公开材料。",
    )


def _gaming_mouse_records(
    platform: str,
    state: dict,
    collected_time: str,
) -> List[dict[str, Any]]:
    dimensions = get_state_dimensions(state)
    product_name = _gaming_mouse_product(platform, state)
    source_cycle = ["official", "review", "ecommerce", "user_review", "news", "report", "review"]
    time_range = state.get("time_range") or "近12个月"
    records: List[dict[str, Any]] = []

    for index, dimension in enumerate(dimensions, start=1):
        source_type = source_cycle[(index - 1) % len(source_cycle)]
        records.append(
            {
                "platform": platform,
                "dimension": dimension,
                "related_dimension": dimension,
                "product_name": product_name,
                "category": "电竞鼠标",
                "source_type": source_type,
                "source_title": _gaming_mouse_source_title(platform, product_name, dimension, source_type),
                "source_url": _gaming_mouse_source_url(platform, product_name, source_type),
                "publish_time": time_range,
                "collected_time": collected_time,
                "raw_content": _gaming_mouse_content(platform, product_name, dimension, source_type, time_range),
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
        related_dimension=_as_text(item.get("related_dimension")) or dimension,
        product_name=_as_text(item.get("product_name")),
        category=_as_text(item.get("category")),
        content=raw_content,
    )
