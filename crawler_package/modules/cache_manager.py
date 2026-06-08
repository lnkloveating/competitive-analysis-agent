import hashlib
import json
import os
import time
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Optional


class CacheManager:
    def __init__(self, cache_root: Optional[Path] = None, ttl_days: int = 7):
        if cache_root is None:
            project_root = Path(__file__).resolve().parents[4]
            cache_root = project_root / "data" / "cache" / "crawled"

        self.cache_root = cache_root
        self.ttl_days = ttl_days
        self.cache_root.mkdir(parents=True, exist_ok=True)

    def _url_to_hash(self, url: str) -> str:
        return hashlib.sha1(url.encode("utf-8")).hexdigest()

    def _get_cache_path(self, url: str) -> Path:
        hash_str = self._url_to_hash(url)
        return self.cache_root / f"{hash_str}.json"

    def is_expired(self, cache_path: Path) -> bool:
        if not cache_path.exists():
            return True
        mtime = cache_path.stat().st_mtime
        elapsed_days = (time.time() - mtime) / 86400.0
        return elapsed_days > self.ttl_days

    def get(self, url: str) -> Optional[Dict[str, Any]]:
        cache_path = self._get_cache_path(url)
        if self.is_expired(cache_path):
            return None
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def put(self, url: str, data: Dict[str, Any]) -> None:
        cache_path = self._get_cache_path(url)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except IOError:
            pass

    def clear_all(self) -> int:
        cleared = 0
        for p in self.cache_root.glob("*.json"):
            try:
                p.unlink()
                cleared += 1
            except Exception:
                pass
        return cleared
