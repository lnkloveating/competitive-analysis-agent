from __future__ import annotations

from typing import Any, Dict

from app.services.mock_research_provider import MockResearchProvider


def _append_trace(state: dict, raw_research_count: int) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "ResearchAgent",
            "status": "success",
            "output_summary": f"collected {raw_research_count} raw research items",
            "error": None,
        }
    )


def research_agent(state: dict) -> Dict[str, Any]:
    """Collect mock research through the provider abstraction."""
    error_log = list(state.get("error_log", []))

    try:
        raw_items = MockResearchProvider().collect(state)
        raw_research = [item.model_dump() for item in raw_items]
    except Exception as exc:
        error_log.append(f"ResearchAgent provider 采集失败：{exc}")
        raw_research = []

    next_state = {
        **state,
        "current_agent": "ResearchAgent",
        "raw_research": raw_research,
        "error_log": error_log,
        "metrics": state.get("metrics", {}),
    }
    _append_trace(next_state, len(raw_research))

    print(f"[ResearchAgent] 采集完成，共 {len(raw_research)} 条原始研究数据")
    return next_state
