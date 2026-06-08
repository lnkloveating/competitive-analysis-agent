#!/usr/bin/env python3
"""Database 模式全链路一键演示脚本，零联网，全本地运行"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.services.crawler.database_research_provider import DatabaseResearchProvider


def main():
    print("=" * 70)
    print("🚀 Database 模式 本地高质量数据采集全链路演示")
    print("=" * 70)
    print()

    for industry_key, industry_name in [
        ("gaming_mouse", "电竞鼠标"),
        ("gaming_keyboard", "电竞键盘"),
        ("gaming_headset", "电竞头戴式耳机"),
    ]:
        print(f"👉 正在加载行业: {industry_name}")
        state = {
            "industry_key": industry_key,
            "target_platform": "罗技",
            "competitors": ["罗技", "雷蛇", "海盗船"],
            "time_range": "近两年",
        }

        provider = DatabaseResearchProvider()
        items = provider.collect(state)

        for idx, item in enumerate(items, 1):
            print(f"  [{idx}] {item.item_id} | {item.platform} | {item.dimension} | {item.source_title}")

        print(f"✅ {industry_name} 加载完成，共 {len(items)} 条全维度高质量数据")
        print()

    print("=" * 70)
    print("🎉 全三个品类全部加载成功！完全离线零联网，零404，零反爬")
    print("=" * 70)


if __name__ == "__main__":
    main()
