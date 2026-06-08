#!/usr/bin/env python3
"""交互式手动单条导入真实采集内容到数据库"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.schemas.research import RawResearchItem
from app.services.crawl_data_service import CrawlDataService


def input_or_default(prompt: str, default: str = "") -> str:
    val = input(f"{prompt} [{default}]: ").strip()
    return val if val else default


def main():
    print("=" * 60)
    print("手动导入真实采集内容到数据库")
    print("=" * 60)

    task_id = input_or_default("请输入目标task_id", f"manual_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    industry_key = input_or_default("请输入行业key", "gaming_mouse")
    item_counter = 1

    task_db_id = CrawlDataService.create_task(task_id, industry_key, "手动导入任务")

    while True:
        print(f"\n--- 第 {item_counter} 条 ---")
        item_id = f"MAN{str(item_counter).zfill(3)}"

        platform = input("platform: ").strip()
        source_type = input_or_default("source_type (official/news/review/ecommerce/user_review/report)", "review")
        source_title = input("source_title: ").strip()
        source_url = input("source_url: ").strip()
        raw_content = input("raw_content: ").strip()
        dimension = input_or_default("dimension", "综合竞争情报")
        category = input_or_default("category", "电竞外设")

        item = RawResearchItem(
            item_id=item_id,
            platform=platform,
            source_type=source_type,
            source_title=source_title,
            source_url=source_url,
            publish_time=None,
            collected_time=datetime.now().isoformat(timespec="seconds"),
            raw_content=raw_content,
            crawl_method="manual",
            dimension=dimension,
            related_dimension=dimension,
            product_name="",
            category=category,
        )

        CrawlDataService.add_item(task_db_id, item)
        print(f"✅ 第 {item_counter} 条导入成功，item_id={item_id}")

        cont = input("\n继续下一条? (y/n): ").strip().lower()
        if cont not in ("y", "yes", ""):
            break
        item_counter += 1

    CrawlDataService.finish_task(task_id, item_counter, item_counter, 0)
    print(f"\n✅ 全部完成！任务task_id={task_id}，共导入 {item_counter} 条数据")


if __name__ == "__main__":
    main()
