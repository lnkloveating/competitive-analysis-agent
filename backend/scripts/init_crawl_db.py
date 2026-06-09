#!/usr/bin/env python3
"""建表脚本：在共享库（默认 backend/auth/auth.db）里创建 crawl_tasks / crawl_raw_items。

用法（在 backend 目录下）：
    python scripts/init_crawl_db.py
"""
import sys
from pathlib import Path

# 把 backend/ 加入 sys.path，保证 auth / app 可被导入
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.crawl_data_service import CrawlDataService


def main() -> None:
    CrawlDataService.ensure_tables()
    print("✅ 爬虫数据表 crawl_tasks / crawl_raw_items 已就绪")


if __name__ == "__main__":
    main()
