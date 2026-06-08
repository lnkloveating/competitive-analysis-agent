#!/usr/bin/env python3
"""批量把data/archive目录下的历史JSON归档文件导入数据库"""
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.schemas.research import RawResearchItem
from app.services.crawl_data_service import CrawlDataService


def main():
    project_root = Path(__file__).resolve().parents[1]
    archive_dir = project_root / "data" / "archive"
    if not archive_dir.exists():
        print(f"归档目录不存在: {archive_dir}")
        return

    imported_count = 0
    for json_file in sorted(archive_dir.glob("*.json")):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            task_id = payload.get("task_id") or json_file.stem.split("_")[0]
            print(f"导入归档文件: {json_file.name}, task_id={task_id}")
            records = payload.get("records", [])
            task_db_id = CrawlDataService.create_task(task_id, "imported", json_file.name)
            success = 0
            for idx, r in enumerate(records, 1):
                r["item_id"] = r.get("item_id") or f"ARC{idx:03d}"
                item = RawResearchItem(**r)
                CrawlDataService.add_item(task_db_id, item)
                success += 1
            CrawlDataService.finish_task(task_id, len(records), success, len(records)-success)
            imported_count += 1
        except Exception as e:
            print(f"跳过 {json_file.name}, error: {e}")
            continue

    print(f"\n✅ 批量导入完成，共处理 {imported_count} 个归档文件")


if __name__ == "__main__":
    main()
