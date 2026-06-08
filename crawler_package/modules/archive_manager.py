import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class ArchiveManager:
    def __init__(self, archive_root: Optional[Path] = None):
        if archive_root is None:
            project_root = Path(__file__).resolve().parents[4]
            archive_root = project_root / "data" / "archive"

        self.archive_root = archive_root
        self.archive_root.mkdir(parents=True, exist_ok=True)

    def save_archive(self, task_id: str, records: List[Dict[str, Any]]) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{task_id}_{timestamp}.json"
        archive_path = self.archive_root / filename

        payload = {
            "task_id": task_id,
            "archived_at": datetime.now().isoformat(timespec="seconds"),
            "record_count": len(records),
            "records": records,
        }

        with open(archive_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return archive_path

    def list_archives(self) -> List[Dict[str, Any]]:
        results = []
        for p in sorted(self.archive_root.glob("*.json"), reverse=True):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                results.append({
                    "filename": p.name,
                    "task_id": meta.get("task_id"),
                    "archived_at": meta.get("archived_at"),
                    "record_count": meta.get("record_count"),
                })
            except Exception:
                continue
        return results

    def load_archive(self, filename: str) -> Optional[Dict[str, Any]]:
        target = self.archive_root / filename
        if not target.exists():
            return None
        try:
            with open(target, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
