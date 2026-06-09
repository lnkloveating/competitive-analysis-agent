#!/usr/bin/env python3
"""增量爬虫 runner：只抓「配置里有、但库里还没有」的种子 URL，抓到的写入 SQLite 爬虫库。

流程：读 crawler_config.yaml 的种子 URL → 减去库里已存在的 source_url → 只爬新增的
     → 下载/抽正文/分类维度 → CrawlDataService.add_item 落库 → finish_task 记成功率。

用法（在 backend 目录下，需已装 trafilatura）：
    python scripts/run_incremental_crawl.py gaming_keyboard
    python scripts/run_incremental_crawl.py gaming_headset
    python scripts/run_incremental_crawl.py gaming_mouse
"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import yaml

from app.schemas.research import RawResearchItem
from app.services.crawl_data_service import CrawlDataService
from app.services.crawler.http_downloader import HttpDownloader
from app.services.crawler.content_extractor import ContentExtractor
from app.services.crawler.cache_manager import CacheManager
from app.services.crawler.dimension_classifier import DimensionClassifier


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "crawler_config.yaml"

LOW_QUALITY_KEYWORDS = [
    "404", "页面不存在", "您浏览的页面暂时不能访问",
    "京东,多快好省", "搜索 我的购物车", "首页 登录 注册",
]


def main() -> None:
    industry_key = sys.argv[1] if len(sys.argv) > 1 else "gaming_mouse"

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    industry_cfg = config.get("industries", {}).get(industry_key, {})
    seed_urls = industry_cfg.get("seed_urls", [])
    category = industry_cfg.get("name", "")
    if not seed_urls:
        print(f"❌ 配置里没有 {industry_key} 的种子 URL，先在 crawler_config.yaml 补上")
        return

    existing = CrawlDataService.existing_urls()
    new_seeds = [s for s in seed_urls if s.get("url") and s["url"] not in existing]
    print(f"种子 {len(seed_urls)} 条，库内已有 {len(existing)} 条 URL，本次需增量爬取 {len(new_seeds)} 条")
    if not new_seeds:
        print("✅ 没有新增 URL，库已是最新")
        return

    downloader = HttpDownloader(CONFIG_PATH)
    extractor = ContentExtractor()
    cache = CacheManager(ttl_days=config.get("global", {}).get("cache_ttl_days", 7))
    classifier = DimensionClassifier()

    collected_time = datetime.now().isoformat(timespec="seconds")
    task_id = f"incr_{industry_key}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    task_pk = CrawlDataService.create_task(task_id, industry_key, f"{industry_key} 增量爬取")

    success = 0
    for idx, seed in enumerate(new_seeds, start=1):
        url = seed["url"]
        source_type = seed.get("source_type", "review")
        platform = seed.get("platform", "未知平台")
        print(f"[{idx}/{len(new_seeds)}] 抓取 {url}")

        cached = cache.get(url)
        if cached:
            title = cached.get("title", "")
            text = cached.get("clean_text", "")
            publish_raw = cached.get("publish_time_raw")
        else:
            dl = downloader.download(url)
            if dl.status_code != 200:
                print(f"   下载失败 status={dl.status_code}，跳过")
                continue
            ext = extractor.extract(dl.html_content)
            title, text, publish_raw = ext.title, ext.clean_text, ext.publish_time_raw
            cache.put(url, {"url": url, "title": title, "clean_text": text, "publish_time_raw": publish_raw})

        if any(kw in text for kw in LOW_QUALITY_KEYWORDS) or len(text.strip()) < 30:
            print("   内容过短/疑似反爬页，跳过")
            continue

        dimension = classifier.classify(industry_key, text)
        item = RawResearchItem(
            item_id=f"INC{idx:03d}",
            platform=platform,
            source_type=source_type,
            source_title=title or f"{platform}公开材料",
            source_url=url,
            publish_time=publish_raw or None,
            collected_time=collected_time,
            raw_content=text,
            crawl_method="crawler",
            dimension=dimension,
            related_dimension=dimension,
            product_name="",
            category=category,
        )
        CrawlDataService.add_item(task_pk, item)
        success += 1
        print(f"   ✅ 入库，维度={dimension}，正文 {len(text)} 字")

    CrawlDataService.finish_task(task_id, len(new_seeds), success, len(new_seeds) - success)
    print(f"\n🎉 增量完成：新增成功 {success}/{len(new_seeds)} 条，库内总数={CrawlDataService.count_items()}")


if __name__ == "__main__":
    main()
