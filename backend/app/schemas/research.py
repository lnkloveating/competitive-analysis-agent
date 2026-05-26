from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class RawResearchItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    item_id: str
    platform: str
    source_type: Literal[
        "official",
        "news",
        "review",
        "report",
        "ecommerce",
        "user_review",
        "mock",
    ]
    source_title: str
    source_url: str
    publish_time: Optional[str] = None
    collected_time: str
    raw_content: str
    crawl_method: Literal["llm_mock", "crawler", "manual", "cache"] = "llm_mock"
