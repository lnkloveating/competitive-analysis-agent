import os
from typing import Any

from app.services.research_provider import ResearchProvider
from app.services.mock_research_provider import MockResearchProvider
from app.services.crawler.crawler_research_provider import CrawlerResearchProvider
from app.services.crawler.database_research_provider import DatabaseResearchProvider


class ResearchProviderFactory:
    @staticmethod
    def create() -> ResearchProvider:
        provider_type = os.getenv("RESEARCH_PROVIDER", "mock").strip().lower()

        if provider_type == "crawler":
            return CrawlerResearchProvider()
        if provider_type == "database":
            return DatabaseResearchProvider()

        return MockResearchProvider()
