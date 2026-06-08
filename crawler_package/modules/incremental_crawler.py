from pathlib import Path
from typing import Any, Dict, List, Optional

from .http_downloader import HttpDownloader
from .content_extractor import ContentExtractor
from .cache_manager import CacheManager


class IncrementalCrawler:
    def __init__(self, base_archive_path: Optional[Path] = None):
        self.downloader = HttpDownloader()
        self.extractor = ContentExtractor()
        self.cache_mgr = CacheManager()
        self.base_archive_path = base_archive_path

    def extract_new_urls_only(self, old_records: List[Dict[str, Any]], new_seed_urls: List[str]) -> List[str]:
        old_urls = {r.get("source_url", "") for r in old_records if isinstance(r, dict)}
        return [url for url in new_seed_urls if url not in old_urls]

    def partial_crawl(self, urls: List[str]) -> List[Dict[str, Any]]:
        new_records = []
        for idx, url in enumerate(urls, start=1):
            cached = self.cache_mgr.get(url)
            if cached:
                new_records.append(cached)
                continue
            dl_result = self.downloader.download(url)
            if dl_result.status_code != 200:
                continue
            ex_result = self.extractor.extract(dl_result.html_content)
            if not ex_result.clean_text:
                continue
            self.cache_mgr.put(url, {
                "url": url,
                "title": ex_result.title,
                "clean_text": ex_result.clean_text,
                "publish_time_raw": ex_result.publish_time_raw,
            })
            new_records.append({
                "source_url": url,
                "source_title": ex_result.title,
                "raw_content": ex_result.clean_text,
                "publish_time": ex_result.publish_time_raw,
            })
        return new_records
