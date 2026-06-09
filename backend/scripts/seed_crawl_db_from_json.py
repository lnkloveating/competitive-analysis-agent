#!/usr/bin/env python3
"""把预载 JSON（data/preload/crawl_seeds.json）灌入爬虫数据库。

按 category 分组，每个品类建一个 preload_* 任务。幂等：重复运行会清空同名任务旧条目后重灌。

用法（在 backend 目录下）：
    python scripts/seed_crawl_db_from_json.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.research import RawResearchItem
from app.services.crawl_data_service import CrawlDataService


CATEGORY_TO_KEY = {
    "电竞鼠标": "gaming_mouse",
    "电竞键盘": "gaming_keyboard",
    "电竞头戴式耳机": "gaming_headset",
}


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    seeds_path = project_root / "data" / "preload" / "crawl_seeds.json"
    if not seeds_path.exists():
        print(f"❌ 预载文件不存在: {seeds_path}")
        return

    records = json.loads(seeds_path.read_text(encoding="utf-8"))
    groups = defaultdict(list)
    for record in records:
        groups[record.get("category", "")].append(record)

    total_ok = 0
    for category, items in groups.items():
        industry_key = CATEGORY_TO_KEY.get(category, "")
        task_id = f"preload_{industry_key or category}"
        task_pk = CrawlDataService.create_task(task_id, industry_key, f"预载{category}数据")

        ok = 0
        for record in items:
            record.setdefault("crawl_method", "database")
            try:
                CrawlDataService.add_item(task_pk, RawResearchItem(**record))
                ok += 1
            except Exception as exc:
                print(f"  跳过一条 {record.get('item_id')}: {exc}")
        CrawlDataService.finish_task(task_id, len(items), ok, len(items) - ok)
        total_ok += ok
        print(f"✅ {category}: 入库 {ok}/{len(items)} 条 (task_id={task_id})")

    print(f"\n🎉 灌库完成，共 {total_ok} 条，库内条目总数={CrawlDataService.count_items()}")


if __name__ == "__main__":
    main()
