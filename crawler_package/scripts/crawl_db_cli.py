#!/usr/bin/env python3
"""爬虫数据库命令行管理工具"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.services.crawl_data_service import CrawlDataService


def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python crawl_db_cli.py stats     查看数据库统计信息")
        print("  python crawl_db_cli.py list      列出所有已入库任务")
        return

    cmd = sys.argv[1]
    if cmd == "stats":
        tasks = CrawlDataService.list_all_tasks()
        total_items = 0
        for t in tasks:
            total_items += t["success_count"]
        print(f"总任务数: {len(tasks)}")
        print(f"总采集条目数: {total_items}")
        return
    if cmd == "list":
        tasks = CrawlDataService.list_all_tasks()
        for t in tasks:
            print(f"[{t['task_id']}] 行业={t['industry_key']} 成功率={t['success_rate']}% 条目数={t['success_count']}")
        return


if __name__ == "__main__":
    main()
