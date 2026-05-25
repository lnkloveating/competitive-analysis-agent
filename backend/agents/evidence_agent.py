"""Evidence Agent - structure raw research into traceable evidence records."""

from __future__ import annotations

import ast
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from .state import CompetitiveAnalysisState


BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
VALID_CREDIBILITIES = {"high", "medium", "low"}
VALID_SOURCE_TYPES = {"official", "news", "review", "report", "user_survey"}
EVIDENCE_FIELDS = (
    "evidence_id",
    "platform",
    "claim",
    "source_type",
    "source_title",
    "source_url",
    "publish_time",
    "collected_time",
    "credibility",
    "related_dimension",
    "used_by_agent",
    "raw_content",
)


def _load_env() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    load_dotenv()


def _llm_enabled() -> bool:
    value = os.getenv("EVIDENCE_AGENT_USE_LLM", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def get_llm() -> ChatOpenAI:
    """Create the Doubao Ark-compatible chat model."""
    _load_env()
    return ChatOpenAI(
        model=os.getenv("ARK_EP", ""),
        api_key=os.getenv("ARK_API_KEY", ""),
        base_url=BASE_URL,
        temperature=0.1,
        timeout=30,
        max_retries=0,
    )


def _response_to_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or item))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    fence_match = re.fullmatch(r"```(?:json|JSON)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return cleaned


def _balanced_json_candidates(text: str) -> Iterable[str]:
    for start, char in enumerate(text):
        if char not in "[{":
            continue

        stack = [char]
        in_string = False
        escape = False

        for index in range(start + 1, len(text)):
            current = text[index]
            if in_string:
                if escape:
                    escape = False
                elif current == "\\":
                    escape = True
                elif current == '"':
                    in_string = False
                continue

            if current == '"':
                in_string = True
            elif current in "[{":
                stack.append(current)
            elif current in "]}":
                if not stack:
                    break
                opening = stack[-1]
                if (opening, current) not in (("[", "]"), ("{", "}")):
                    break
                stack.pop()
                if not stack:
                    yield text[start : index + 1]
                    break


def _json_candidates(text: str) -> Iterable[str]:
    cleaned = _strip_json_fence(text)
    yield cleaned

    for block in re.findall(r"```(?:json|JSON)?\s*(.*?)\s*```", text, re.DOTALL):
        yield block.strip()

    yield from _balanced_json_candidates(text)


def _try_parse_json(candidate: str) -> Any:
    normalized = candidate.strip().lstrip("\ufeff")
    normalized = re.sub(r",\s*([}\]])", r"\1", normalized)
    try:
        return json.loads(normalized)
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(normalized)
        except (SyntaxError, ValueError):
            return None


def _parse_response(text: str) -> Any:
    """Parse unstable LLM JSON from raw text, markdown fences, or nested blocks."""
    for candidate in _json_candidates(text):
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed
    return None


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False)


def _canonical_source_type(source_type: str, source_url: str = "") -> str:
    combined = f"{source_type} {source_url}".lower()
    if "financial" in combined or "finance" in combined or "report" in combined or "investor" in combined:
        return "report"
    if "app_store" in combined or "app store" in combined or "apps.apple" in combined or "review" in combined:
        return "review"
    if "survey" in combined or "用户调研" in combined:
        return "user_survey"
    if "news" in combined or "press" in combined or "新闻" in combined:
        return "news"
    if "official" in combined or "官网" in combined or "www." in combined:
        return "official"
    return source_type if source_type in VALID_SOURCE_TYPES else "news"


def _infer_credibility(source_type: str, source_url: str = "", raw_content: str = "") -> str:
    combined = f"{source_type} {source_url} {raw_content}".lower()
    if source_type in {"official", "report"}:
        return "high"
    if "财报" in combined or "annual report" in combined or "financial report" in combined:
        return "high"
    if "investor" in combined or "ir." in combined:
        return "high"
    if "权威媒体" in combined or "official" in combined:
        return "high"
    if source_type in {"review", "user_survey"}:
        return "low"
    if "用户评论" in combined or "社交媒体" in combined or "匿名" in combined:
        return "low"
    return "medium"


def _build_source_title(raw_item: Dict[str, Any], source_type: str) -> str:
    explicit_title = _as_text(
        raw_item.get("source_title")
        or raw_item.get("title")
        or raw_item.get("source")
        or raw_item.get("source_name")
    )
    if explicit_title:
        return explicit_title

    platform = _as_text(raw_item.get("platform")) or "未知平台"
    dimension = _as_text(raw_item.get("dimension") or raw_item.get("related_dimension")) or "综合维度"
    source_names = {
        "official": "官网公开信息",
        "news": "新闻报道",
        "review": "App Store 评论与页面信息",
        "report": "财报或行业报告",
        "user_survey": "用户调研信息",
    }
    return f"{platform}{dimension}{source_names.get(source_type, '公开信息')}"


def _fallback_claim(raw_item: Dict[str, Any]) -> str:
    platform = _as_text(raw_item.get("platform")) or "该平台"
    dimension = _as_text(raw_item.get("dimension") or raw_item.get("related_dimension")) or "相关维度"
    content = _as_text(raw_item.get("content") or raw_item.get("raw_content"))
    if not content:
        return f"{platform}在{dimension}上存在可用于竞品分析的公开信息。"

    sentence = re.split(r"[。！？!?]\s*", content, maxsplit=1)[0].strip(" ，,；;")
    if not sentence:
        sentence = content[:80].strip()
    if platform not in sentence:
        sentence = f"{platform}在{dimension}上表现为：{sentence}"
    return sentence[:120]


def _build_prompt(raw_item: Dict[str, Any]) -> str:
    return f"""
你是 EvidenceAgent，负责把 ResearchAgent 的单条原始采集信息结构化为证据。

可信度评分标准：
- high：来自官网、上市公司财报、权威媒体
- medium：来自行业报告、知名媒体
- low：来自用户评论、社交媒体、匿名来源

请只输出一个 JSON 对象，不要输出 Markdown 或解释文字。字段如下：
{{
  "claim": "该证据支持的核心结论，一句话",
  "source_type": "official/news/review/report/user_survey",
  "source_title": "来源标题",
  "credibility": "high/medium/low",
  "related_dimension": "对应分析维度"
}}

原始信息：
{json.dumps(raw_item, ensure_ascii=False)}
""".strip()


def _extract_object(payload: Any) -> Dict[str, Any]:
    if payload is None:
        return {}
    if isinstance(payload, str):
        return _extract_object(_parse_response(payload))
    if isinstance(payload, dict):
        for key in ("evidence", "record", "data", "result", "item"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                return nested
            if isinstance(nested, list) and nested and isinstance(nested[0], dict):
                return nested[0]
        return payload
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                return item
    return {}


def _structure_with_llm(llm: ChatOpenAI | None, raw_item: Dict[str, Any]) -> Dict[str, Any]:
    if llm is None:
        return {}

    prompt = _build_prompt(raw_item)
    response = llm.invoke(prompt)
    parsed = _parse_response(_response_to_text(response))
    return _extract_object(parsed)


def _normalize_evidence(
    raw_item: Dict[str, Any],
    llm_item: Dict[str, Any],
    evidence_id: str,
    collected_time: str,
) -> Dict[str, str]:
    raw_source_type = _as_text(
        llm_item.get("source_type")
        or llm_item.get("sourceType")
        or raw_item.get("source_type")
        or raw_item.get("sourceType")
    )
    source_url = _as_text(
        raw_item.get("source_url")
        or raw_item.get("sourceUrl")
        or raw_item.get("url")
        or raw_item.get("link")
        or llm_item.get("source_url")
    )
    source_type = _canonical_source_type(raw_source_type, source_url)

    raw_content = _as_text(raw_item.get("content") or raw_item.get("raw_content"))
    credibility = _as_text(llm_item.get("credibility")).lower()
    if credibility not in VALID_CREDIBILITIES:
        credibility = _infer_credibility(source_type, source_url, raw_content)

    evidence = {
        "evidence_id": evidence_id,
        "platform": _as_text(llm_item.get("platform") or raw_item.get("platform")) or "未知平台",
        "claim": _as_text(llm_item.get("claim") or llm_item.get("core_claim")) or _fallback_claim(raw_item),
        "source_type": source_type,
        "source_title": _as_text(llm_item.get("source_title") or llm_item.get("sourceTitle"))
        or _build_source_title(raw_item, source_type),
        "source_url": source_url,
        "publish_time": _as_text(
            raw_item.get("publish_time")
            or raw_item.get("publishTime")
            or raw_item.get("date")
            or llm_item.get("publish_time")
        ),
        "collected_time": collected_time,
        "credibility": credibility,
        "related_dimension": _as_text(
            llm_item.get("related_dimension")
            or llm_item.get("relatedDimension")
            or raw_item.get("dimension")
            or raw_item.get("related_dimension")
        )
        or "综合维度",
        "used_by_agent": "EvidenceAgent",
        "raw_content": raw_content,
    }
    return {field: evidence[field] for field in EVIDENCE_FIELDS}


def _coerce_raw_item(item: Any) -> Dict[str, Any]:
    if isinstance(item, dict):
        return item
    return {"content": _as_text(item), "source_type": "news"}


def evidence_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """Convert raw_research into Evidence Schema records with credibility labels."""
    _load_env()
    raw_research = state.get("raw_research", [])
    error_log = list(state.get("error_log", []))
    evidence_list: List[Dict[str, str]] = []
    collected_time = datetime.now().isoformat(timespec="seconds")

    llm: ChatOpenAI | None = None
    if not _llm_enabled():
        error_log.append("EvidenceAgent 已按 EVIDENCE_AGENT_USE_LLM 配置跳过 LLM 调用，使用兜底结构化逻辑。")
    elif os.getenv("ARK_EP") and os.getenv("ARK_API_KEY"):
        try:
            llm = get_llm()
        except Exception as exc:  # pragma: no cover - defensive guard for SDK init.
            error_log.append(f"EvidenceAgent 初始化 LLM 失败：{exc}")
    else:
        error_log.append("EvidenceAgent 未找到 ARK_EP 或 ARK_API_KEY，已启用兜底结构化逻辑。")

    for index, item in enumerate(raw_research, start=1):
        raw_item = _coerce_raw_item(item)
        evidence_id = f"EV{index:03d}"
        try:
            llm_item = _structure_with_llm(llm, raw_item)
        except Exception as exc:
            error_log.append(f"EvidenceAgent 处理 {evidence_id} 失败：{exc}")
            llm_item = {}

        evidence_list.append(
            _normalize_evidence(
                raw_item=raw_item,
                llm_item=llm_item,
                evidence_id=evidence_id,
                collected_time=collected_time,
            )
        )

    print(f"[EvidenceAgent] 处理完成，共 {len(evidence_list)} 条证据")
    return {
        **state,
        "current_agent": "EvidenceAgent",
        "evidence_list": evidence_list,
        "error_log": error_log,
    }
