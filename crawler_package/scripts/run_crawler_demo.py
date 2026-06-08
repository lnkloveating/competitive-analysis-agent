"""实时爬虫一键演示脚本"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.services.crawler.crawler_research_provider import CrawlerResearchProvider


def main():
    print("=" * 60)
    print("实时爬虫演示")
    print("=" * 60)

    state = {
        "industry_key": "gaming_mouse",
        "target_platform": "罗技",
        "competitors": ["罗技", "雷蛇", "海盗船"],
        "time_range": "近两年",
    }

    print(f"当前分析行业: {state['industry_key']}")
    print(f"目标平台: {state['target_platform']}")
    print(f"竞品列表: {state['competitors']}")
    print()

    provider = CrawlerResearchProvider()
    records = provider.collect(state)

    print()
    print("=" * 60)
    print(f"爬取完成，共获得 {len(records)} 条 RawResearchItem 数据")
    print("=" * 60)

    for idx, item in enumerate(records, 1):
        print(f"\n--- 第 {idx} 条 ---")
        print(f"item_id: {item.item_id}")
        print(f"platform: {item.platform}")
        print(f"source_type: {item.source_type}")
        print(f"source_title: {item.source_title}")
        print(f"source_url: {item.source_url}")
        print(f"dimension: {getattr(item, 'dimension', '')}")
        print(f"raw_content 前100字: {item.raw_content[:100]}...")

    print()
    print("=" * 60)
    print("输出完整JSON:")
    print("=" * 60)
    output = [r.model_dump() for r in records]
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
