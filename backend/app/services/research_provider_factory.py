from __future__ import annotations

import os

from app.services.research_provider import ResearchProvider
from app.services.mock_research_provider import MockResearchProvider


class ResearchProviderFactory:
    """根据 RESEARCH_PROVIDER 环境变量选择研究数据来源。

    - "database"：读取本地预载爬虫数据库（鼠标/键盘/耳机等高质量真实数据），推荐默认值。
    - "crawler"：实时抓取公开站点（需要 trafilatura、httpx、pyyaml 等依赖）。
    - "mock"（兜底）：LLM/确定性模拟数据。

    爬虫相关 provider 采用延迟导入，避免在 database/mock 模式下强制依赖
    实时抓取的第三方库。
    """

    @staticmethod
    def create() -> ResearchProvider:
        provider_type = os.getenv("RESEARCH_PROVIDER", "database").strip().lower()

        if provider_type == "crawler":
            from app.services.crawler.crawler_research_provider import CrawlerResearchProvider

            return CrawlerResearchProvider()
        if provider_type == "database":
            from app.services.crawler.database_research_provider import DatabaseResearchProvider

            return DatabaseResearchProvider()

        return MockResearchProvider()
