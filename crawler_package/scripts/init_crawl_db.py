#!/usr/bin/env python3
"""爬虫数据表初始化脚本"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from auth.db import Base, get_engine
from app.models.crawl_models import CrawlTask, CrawlRawItem  # noqa: F401


def main():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print("✅ 爬虫数据表 crawl_tasks 和 crawl_raw_items 创建成功！")


if __name__ == "__main__":
    main()
