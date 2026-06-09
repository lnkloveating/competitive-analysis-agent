#!/usr/bin/env python3
"""爬虫数据库命令行工具。

用法（在 backend 目录下）：
    python scripts/crawl_db_cli.py stats   查看统计
    python scripts/crawl_db_cli.py list    列出所有任务
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.crawl_data_service import CrawlDataService


def main() -> None:
    if len(sys.argv) < 2:
        print("用法:")
        print("  python scripts/crawl_db_cli.py stats   查看数据库统计信息")
        print("  python scripts/crawl_db_cli.py list    列出所有已入库任务")
        return

    cmd = sys.argv[1]
    tasks = CrawlDataService.list_all_tasks()

    if cmd == "stats":
        total_items = sum(t["success_count"] for t in tasks)
        print(f"总任务数: {len(tasks)}")
        print(f"总采集条目数: {total_items}")
        print(f"库内条目实际行数: {CrawlDataService.count_items()}")
        return

    if cmd == "list":
        for t in tasks:
            print(
                f"[{t['task_id']}] 行业={t['industry_key']} "
                f"状态={t['status']} 成功率={t['success_rate']}% 条目数={t['success_count']}"
            )
        return

    print(f"未知命令: {cmd}")


if __name__ == "__main__":
    main()
