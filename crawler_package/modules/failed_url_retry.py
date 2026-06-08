import json
from pathlib import Path
from typing import Any, Dict, List, Optional


class FailedUrlRetryQueue:
    def __init__(self, queue_path: Optional[Path] = None):
        if queue_path is None:
            project_root = Path(__file__).resolve().parents[4]
            queue_path = project_root / "data" / "cache" / "failed_url_queue.json"

        self.queue_path = queue_path
        self.queue_path.parent.mkdir(parents=True, exist_ok=True)

    def push(self, url: str, reason: str) -> None:
        queue = self.load()
        for item in queue:
            if item.get("url") == url:
                return
        queue.append({"url": url, "fail_reason": reason, "retry_count": 0})
        self._save(queue)

    def load(self) -> List[Dict[str, Any]]:
        if not self.queue_path.exists():
            return []
        try:
            with open(self.queue_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []

    def _save(self, queue: List[Dict[str, Any]]) -> None:
        with open(self.queue_path, "w", encoding="utf-8") as f:
            json.dump(queue, f, ensure_ascii=False, indent=2)

    def pop_all(self) -> List[Dict[str, Any]]:
        items = self.load()
        self._save([])
        return items

    def clear(self) -> None:
        self._save([])
