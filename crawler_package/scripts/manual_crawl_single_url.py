#!/usr/bin/env python3
"""手动指定单URL爬取工具"""
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.schemas.research import RawResearchItem
from app.services.crawler.http_downloader import HttpDownloader
from app.services.crawler.content_extractor import ContentExtractor
from app.services.crawler.cache_manager import CacheManager
from app.services.crawler.dimension_classifier import DimensionClassifier


def main():
    if len(sys.argv) < 2:
        print("用法: python manual_crawl_single_url.py <URL> [source_type] [platform]")
        print("示例: python manual_crawl_single_url.py https://example.com review 罗技")
        return

    url = sys.argv[1]
    source_type = sys.argv[2] if len(sys.argv) > 2 else "review"
    platform = sys.argv[3] if len(sys.argv) > 3 else "自定义平台"

    downloader = HttpDownloader()
    extractor = ContentExtractor()
    cache_mgr = CacheManager()
    classifier = DimensionClassifier()

    print(f"开始爬取: {url}")
    download_result = downloader.download(url)

    if download_result.status_code != 200:
        print(f"下载失败, status={download_result.status_code}, error={download_result.error_msg}")
        return

    extract_result = extractor.extract(download_result.html_content)
    cache_mgr.put(url, {
        "url": url,
        "source_type": source_type,
        "platform": platform,
        "title": extract_result.title,
        "clean_text": extract_result.clean_text,
        "publish_time_raw": extract_result.publish_time_raw,
    })

    dimension = classifier.classify("gaming_mouse", extract_result.clean_text)

    item = RawResearchItem(
        item_id=f"MAN{datetime.now().strftime('%H%M%S')}",
        platform=platform,
        source_type=source_type,
        source_title=extract_result.title or "手动爬取公开材料",
        source_url=url,
        publish_time=extract_result.publish_time_raw or None,
        collected_time=datetime.now().isoformat(timespec="seconds"),
        raw_content=extract_result.clean_text,
        crawl_method="crawler",
        dimension=dimension,
        related_dimension=dimension,
        product_name="",
        category="手动采集",
        content=extract_result.clean_text,
    )

    print()
    print("爬取成功！生成的 RawResearchItem:")
    print(json.dumps(item.model_dump(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
