import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import trafilatura


@dataclass
class ExtractResult:
    title: str
    clean_text: str
    publish_time_raw: Optional[str]


class ContentExtractor:
    def __init__(self):
        self.date_patterns = [
            re.compile(r"(20\d{2})[年\-/\.](0?[1-9]|1[0-2])[月\-/\.](0?[1-9]|[12][0-9]|3[01])"),
            re.compile(r"(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"),
            re.compile(r"(20\d{2})/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])"),
            re.compile(r"发布于\s*(\d+)天前"),
            re.compile(r"更新时间[：:]\s*(20\d{2}[年\-/\.][01]?\d[月\-/\.][0-3]?\d)"),
            re.compile(r"发布时间[：:]\s*(20\d{2}[年\-/\.][01]?\d[月\-/\.][0-3]?\d)"),
        ]

    def _parse_date_text(self, text: str) -> Optional[str]:
        current_year = datetime.now().year
        current_dt = datetime.now()

        for pattern in self.date_patterns:
            match = pattern.search(text)
            if not match:
                continue
            groups = match.groups()

            if len(groups) == 1 and "天前" in text:
                days_ago = int(groups[0])
                target_dt = current_dt - timedelta(days=days_ago)
                return target_dt.strftime("%Y-%m-%d")

            try:
                y, m, d = int(groups[0]), int(groups[1]), int(groups[2])
                if 2015 <= y <= current_year and 1 <= m <= 12 and 1 <= d <= 31:
                    return f"{y:04d}-{m:02d}-{d:02d}"
            except (ValueError, IndexError):
                pass

        return None

    def extract(self, html_content: str) -> ExtractResult:
        if not html_content or len(html_content.strip()) < 10:
            return ExtractResult(
                title="",
                clean_text="",
                publish_time_raw=None,
            )

        try:
            extracted_doc = trafilatura.extract(
                html_content,
                output_format='json',
                include_links=False,
                include_images=False,
            )
        except Exception:
            extracted_doc = None

        title = ""
        clean_text = ""
        publish_time_raw = None

        if extracted_doc:
            import json
            try:
                parsed = json.loads(extracted_doc)
                title = parsed.get("title", "") or ""
                clean_text = parsed.get("text", "") or ""
                publish_time_raw = parsed.get("date") or ""
            except (json.JSONDecodeError, TypeError):
                clean_text = extracted_doc or ""

        if not title:
            title_match = re.search(r"<title>([^<]+)</title>", html_content, re.IGNORECASE)
            if title_match:
                title = title_match.group(1).strip()

        if not publish_time_raw:
            publish_time_raw = self._parse_date_text(html_content)

        return ExtractResult(
            title=title,
            clean_text=clean_text or "",
            publish_time_raw=publish_time_raw,
        )


from datetime import timedelta
