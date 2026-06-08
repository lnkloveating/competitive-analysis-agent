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
        preload_path = Path(__file__).resolve().parents[5] / "data" / "preload" / "crawl_seeds.json"
        self.preload_path = preload_path

    def collect(self, state: dict) -> List[RawResearchItem]:
        collected_time = datetime.now().isoformat(timespec="seconds")
        industry_key = state.get("industry_key") or "gaming_mouse"
        target_category = CATEGORY_FILTER_MAP.get(industry_key, "电竞鼠标")

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

        print(f"[DatabaseProvider] Industry={industry_key} category={target_category}, loaded {len(items)} high quality preload items from local database")
        return items
