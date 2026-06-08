import random
import time
import json
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Optional

import httpx
import yaml


@dataclass
class DownloadResult:
    url: str
    status_code: int
    html_content: str
    error_msg: str
    consumed_time_ms: int


class HttpDownloader:
    def __init__(self, config_path: Optional[Path] = None):
        if config_path is None:
            config_path = Path(__file__).resolve().parents[3] / "config" / "crawler_config.yaml"

        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)

        global_cfg = self.config.get("global", {})
        self.timeout = global_cfg.get("request_timeout", 15)
        self.max_retry_times = global_cfg.get("max_retry_times", 3)
        self.min_delay = global_cfg.get("min_delay_sec", 1)
        self.max_delay = global_cfg.get("max_delay_sec", 3)
        self.follow_redirects = global_cfg.get("follow_redirects", True)

        self.user_agents = self.config.get("user_agents", [])
        if not self.user_agents:
            self.user_agents = ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"]

        self._client: Optional[httpx.Client] = None

    def _get_random_ua(self) -> str:
        return random.choice(self.user_agents)

    def _get_default_headers(self) -> dict:
        return {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "max-age=0",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        }

    def _get_client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=self.timeout,
                follow_redirects=self.follow_redirects,
                verify=False,
                http2=False,
            )
        return self._client

    def _sleep_random(self) -> None:
        delay = random.uniform(self.min_delay, self.max_delay)
        time.sleep(delay)

    def download(self, url: str) -> DownloadResult:
        result = DownloadResult(
            url=url,
            status_code=0,
            html_content="",
            error_msg="",
            consumed_time_ms=0,
        )
        start_time = time.perf_counter()

        for attempt in range(self.max_retry_times + 1):
            try:
                headers = self._get_default_headers()
                headers["User-Agent"] = self._get_random_ua()

                resp = self._get_client().get(url, headers=headers)
                result.status_code = resp.status_code
                resp.encoding = resp.apparent_encoding or "utf-8"
                result.html_content = resp.text
                result.error_msg = ""

                if resp.status_code == 200:
                    break

            except Exception as exc:
                result.error_msg = str(exc)
                result.status_code = -1

            if attempt < self.max_retry_times:
                time.sleep(1)

        result.consumed_time_ms = int((time.perf_counter() - start_time) * 1000)
        self._sleep_random()
        return result
