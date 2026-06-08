import os
import tempfile
from pathlib import Path

import pytest

from app.services.crawler.cache_manager import CacheManager
from app.services.crawler.dimension_classifier import DimensionClassifier
from app.services.crawler.crawler_research_provider import CrawlerResearchProvider
from app.services.research_provider_factory import ResearchProviderFactory
from app.services.mock_research_provider import MockResearchProvider


def test_dimension_classifier():
    classifier = DimensionClassifier()
    dim = classifier.classify("gaming_mouse", "这款鼠标搭载顶级光学传感器DPI可达26000")
    assert dim == "性能参数"


def test_cache_manager_read_write():
    with tempfile.TemporaryDirectory() as tmpdir:
        cm = CacheManager(Path(tmpdir), ttl_days=7)
        test_url = "https://example.com/test"
        data = {"hello": "world"}
        cm.put(test_url, data)
        loaded = cm.get(test_url)
        assert loaded is not None
        assert loaded["hello"] == "world"


def test_provider_factory_default_mock():
    old_env = os.environ.pop("RESEARCH_PROVIDER", None)
    provider = ResearchProviderFactory.create()
    assert isinstance(provider, MockResearchProvider)
    if old_env is not None:
        os.environ["RESEARCH_PROVIDER"] = old_env


def test_crawler_provider_instantiation():
    provider = CrawlerResearchProvider()
    assert provider is not None


def test_source_type_schema_constraint():
    valid_source_types = {"official", "news", "review", "ecommerce", "user_review", "report", "mock"}
    assert len(valid_source_types) == 7
