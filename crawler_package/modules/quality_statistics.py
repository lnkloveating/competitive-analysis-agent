from typing import Any, Dict, List


class CrawlQualityStatistics:
    def generate_report(self, total_urls: int, success_items: List[Any], total_time_ms: int) -> Dict[str, Any]:
        source_type_dist: Dict[str, int] = {}
        total_chars = 0

        for item in success_items:
            st = getattr(item, "source_type", "unknown")
            source_type_dist[st] = source_type_dist.get(st, 0) + 1

            raw_content = getattr(item, "raw_content", "") or ""
            total_chars += len(raw_content)

        success_count = len(success_items)
        fail_count = total_urls - success_count
        avg_content_len = total_chars // success_count if success_count > 0 else 0

        return {
            "total_urls": total_urls,
            "success_count": success_count,
            "fail_count": fail_count,
            "success_rate": round(success_count / max(total_urls, 1) * 100, 2),
            "total_time_ms": total_time_ms,
            "avg_content_length": avg_content_len,
            "source_type_distribution": source_type_dist,
        }
