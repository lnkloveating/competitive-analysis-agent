"""Industry configurations for multi-sector competitive analysis."""

from __future__ import annotations

from typing import Any, Mapping


COMMON_SCHEMA_FIELDS = [
    "product_name",
    "brand",
    "category",
    "price",
    "release_date",
    "specs",
    "software_info",
    "rating",
    "review_count",
    "common_pros",
    "common_cons",
    "market_share",
    "growth_trend",
]

DEFAULT_DATA_SOURCES = {
    "official": "品牌官网、产品页、软件支持页",
    "news": "新闻报道、品牌公告、行业资讯",
    "review": "专业评测、用户评论、电商评价",
    "report": "财报、行业报告、渠道报告",
    "user_survey": "用户调研、社区讨论、论坛反馈",
}

DEFAULT_DIMENSIONS = ["产品能力", "用户口碑", "定价策略", "市场表现"]

INDUSTRY_CONFIGS = {
    "gaming_peripherals": {
        "name": "电竞外设",
        "competitors": ["罗技", "雷蛇", "海盗船", "SteelSeries"],
        "dimensions": ["硬件性能", "软件驱动", "用户口碑", "定价策略", "产品线广度"],
        "data_sources": DEFAULT_DATA_SOURCES.copy(),
        "schema_fields": COMMON_SCHEMA_FIELDS.copy(),
    },
    "smartphones": {
        "name": "智能手机",
        "competitors": ["iPhone", "三星", "华为", "小米"],
        "dimensions": ["硬件参数", "系统体验", "摄影能力", "定价策略", "生态系统"],
        "data_sources": DEFAULT_DATA_SOURCES.copy(),
        "schema_fields": COMMON_SCHEMA_FIELDS.copy(),
    },
    "headphones": {
        "name": "耳机",
        "competitors": ["索尼", "Bose", "苹果", "森海塞尔"],
        "dimensions": ["音质参数", "降噪能力", "续航", "定价", "用户口碑"],
        "data_sources": DEFAULT_DATA_SOURCES.copy(),
        "schema_fields": COMMON_SCHEMA_FIELDS.copy(),
    },
    "cameras": {
        "name": "摄影器材",
        "competitors": ["索尼", "佳能", "尼康", "富士"],
        "dimensions": ["传感器性能", "对焦系统", "视频能力", "定价", "镜头生态"],
        "data_sources": DEFAULT_DATA_SOURCES.copy(),
        "schema_fields": COMMON_SCHEMA_FIELDS.copy(),
    },
}


def get_industry_config(industry_key: str | None) -> dict[str, Any]:
    """Return the configured industry by key, or an empty config."""
    return INDUSTRY_CONFIGS.get(industry_key or "", {})


def get_state_industry_name(state: Mapping[str, Any]) -> str:
    """Resolve industry display name from state first, then config."""
    industry_name = state.get("industry_name")
    if isinstance(industry_name, str) and industry_name.strip():
        return industry_name.strip()

    config = get_industry_config(state.get("industry_key"))
    return str(config.get("name") or "通用行业")


def get_state_dimensions(state: Mapping[str, Any]) -> list[str]:
    """Resolve analysis dimensions from state first, then industry config."""
    dimensions = state.get("focus_dimensions")
    if isinstance(dimensions, list):
        resolved = [str(item).strip() for item in dimensions if str(item).strip()]
        if resolved:
            return resolved

    config = get_industry_config(state.get("industry_key"))
    configured_dimensions = config.get("dimensions")
    if isinstance(configured_dimensions, list):
        resolved = [str(item).strip() for item in configured_dimensions if str(item).strip()]
        if resolved:
            return resolved

    return DEFAULT_DIMENSIONS.copy()


def get_state_data_sources(state: Mapping[str, Any]) -> dict[str, str]:
    """Resolve configured source types and descriptions for an industry."""
    config = get_industry_config(state.get("industry_key"))
    data_sources = config.get("data_sources")
    if isinstance(data_sources, dict) and data_sources:
        return {str(key): str(value) for key, value in data_sources.items()}
    return DEFAULT_DATA_SOURCES.copy()
