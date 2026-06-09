from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import yaml

from app.schemas.research import RawResearchItem
from app.services.research_provider import ResearchProvider

from .http_downloader import HttpDownloader
from .content_extractor import ContentExtractor
from .cache_manager import CacheManager
from .dimension_classifier import DimensionClassifier


class CrawlerResearchProvider(ResearchProvider):
    def __init__(self):
        self.config_path = Path(__file__).resolve().parents[3] / "config" / "crawler_config.yaml"

        with open(self.config_path, "r", encoding="utf-8") as f:
            self.full_config = yaml.safe_load(f)

        global_cfg = self.full_config.get("global", {})
        ttl_days = global_cfg.get("cache_ttl_days", 7)

        self.downloader = HttpDownloader(self.config_path)
        self.extractor = ContentExtractor()
        self.cache_mgr = CacheManager(ttl_days=ttl_days)
        self.classifier = DimensionClassifier()

    def collect(self, state: dict) -> List[RawResearchItem]:
        collected_time = datetime.now().isoformat(timespec="seconds")
        industry_key = state.get("industry_key") or "gaming_mouse"
        platforms = self._get_platforms(state)

        industries_cfg = self.full_config.get("industries", {})
        industry_cfg = industries_cfg.get(industry_key, {})
        seed_url_list = industry_cfg.get("seed_urls", [])

        records: List[RawResearchItem] = []

        for idx, seed_info in enumerate(seed_url_list, start=1):
            url = seed_info.get("url", "")
            source_type = seed_info.get("source_type", "review")
            platform = seed_info.get("platform", platforms[0] if platforms else "未知平台")

            print(f"[Crawler] Processing {idx}/{len(seed_url_list)}: {url}")

            cached = self.cache_mgr.get(url)
            if cached:
                print(f"[Crawler] Cache hit: {url}")
                item = self._build_item_from_cache(cached, collected_time)
                records.append(item)
                continue

            download_result = self.downloader.download(url)
            if download_result.status_code != 200:
                print(f"[Crawler] Download failed: {url}, status={download_result.status_code}")
                continue

            extract_result = self.extractor.extract(download_result.html_content)
            
            # 过滤404、反爬页面导航内容
            low_quality_keywords = [
                "404", "页面不存在", "您浏览的页面暂时不能访问",
                "京东,多快好省", "搜索 我的购物车", "首页 登录 注册",
            ]
            skip = False
            for kw in low_quality_keywords:
                if kw in extract_result.clean_text:
                    print(f"[Crawler] Skip low quality anti-crawl page: {url}")
                    skip = True
                    break
            if skip:
                continue

            if len(extract_result.clean_text.strip()) < 30:
                print(f"[Crawler] Too short content, skip: {url}")
                continue

            cache_payload: Dict[str, Any] = {
                "url": url,
                "source_type": source_type,
                "platform": platform,
                "title": extract_result.title,
                "clean_text": extract_result.clean_text,
                "publish_time_raw": extract_result.publish_time_raw,
            }
            self.cache_mgr.put(url, cache_payload)

            dimension = self.classifier.classify(industry_key, extract_result.clean_text)

            item = RawResearchItem(
                item_id=f"CR{idx:03d}",
                platform=platform,
                source_type=source_type,
                source_title=extract_result.title or f"{platform}公开材料",
                source_url=url,
                publish_time=extract_result.publish_time_raw or None,
                collected_time=collected_time,
                raw_content=extract_result.clean_text,
                crawl_method="crawler",
                dimension=dimension,
                related_dimension=dimension,
                product_name="",
                category=str(industry_cfg.get("name", "电竞外设")),
                content=extract_result.clean_text,
            )
            records.append(item)
            print(f"[Crawler] Success: {url}")

        return records

    def _get_platforms(self, state: dict) -> List[str]:
        platforms: List[str] = []
        for platform in [state.get("target_platform", ""), *state.get("competitors", [])]:
            if platform and platform not in platforms:
                platforms.append(platform)
        return platforms

    def _build_item_from_cache(self, cached: Dict[str, Any], collected_time: str) -> RawResearchItem:
        dimension = self.classifier.classify("gaming_mouse", cached.get("clean_text", ""))
        return RawResearchItem(
            item_id=cached.get("item_id", "CR000"),
            platform=cached.get("platform", "未知平台"),
            source_type=cached.get("source_type", "review"),
            source_title=cached.get("title", "缓存公开材料"),
            source_url=cached.get("url", ""),
            publish_time=cached.get("publish_time_raw"),
            collected_time=collected_time,
            raw_content=cached.get("clean_text", ""),
            crawl_method="crawler",
            dimension=dimension,
            related_dimension=dimension,
            product_name="",
            category="电竞外设",
            content=cached.get("clean_text", ""),
        )
