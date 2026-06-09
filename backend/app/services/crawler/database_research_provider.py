from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List

from app.schemas.research import RawResearchItem
from app.services.research_provider import ResearchProvider


CATEGORY_FILTER_MAP = {
    "gaming_mouse": "电竞鼠标",
    "gaming_keyboard": "电竞键盘",
    "gaming_headset": "电竞头戴式耳机",
}


class DatabaseResearchProvider(ResearchProvider):
    def __init__(self):
        # backend/app/services/crawler/database_research_provider.py -> parents[4] = 项目根目录
        preload_path = Path(__file__).resolve().parents[4] / "data" / "preload" / "crawl_seeds.json"
        self.preload_path = preload_path

    def collect(self, state: dict) -> List[RawResearchItem]:
        collected_time = datetime.now().isoformat(timespec="seconds")
        industry_key = state.get("industry_key") or "gaming_mouse"
        target_category = CATEGORY_FILTER_MAP.get(industry_key, "电竞鼠标")

        # 优先查 SQLite 爬虫库；表中有该品类数据则直接返回，空/异常再回退预载 JSON。
        db_items = self._load_from_db(target_category, collected_time)
        if db_items:
            print(
                f"[DatabaseProvider] Industry={industry_key} category={target_category}, "
                f"loaded {len(db_items)} items from crawl DB"
            )
            return db_items

        return self._load_from_json(industry_key, target_category, collected_time)

    def _load_from_db(self, target_category: str, collected_time: str) -> List[RawResearchItem]:
        try:
            from app.services.crawl_data_service import CrawlDataService

            items = CrawlDataService.load_items_by_category(target_category)
        except Exception as exc:  # 库不可用/未建表时静默回退 JSON
            print(f"[DatabaseProvider] crawl DB unavailable, fallback to JSON: {exc}")
            return []

        for item in items:
            item.collected_time = collected_time
        return items

    def _load_from_json(
        self, industry_key: str, target_category: str, collected_time: str
    ) -> List[RawResearchItem]:
        if not self.preload_path.exists():
            print(f"[DatabaseProvider] Preload seeds not found, fallback empty")
            return []

        with open(self.preload_path, "r", encoding="utf-8") as f:
            seeds = json.load(f)

        items = []
        for idx, s in enumerate(seeds, 1):
            item_category = s.get("category", "")
            if item_category != target_category:
                continue
            s["collected_time"] = collected_time
            s["crawl_method"] = "database"
            items.append(RawResearchItem(**s))

        print(f"[DatabaseProvider] Industry={industry_key} category={target_category}, loaded {len(items)} high quality preload items from local JSON")
        return items
