import os
import sys
from pathlib import Path

from dotenv import load_dotenv


os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["RESEARCH_AGENT_USE_LLM"] = "0"
os.environ["EVIDENCE_AGENT_USE_LLM"] = "0"
os.environ["PRODUCT_AGENT_USE_LLM"] = "0"
os.environ["BUSINESS_AGENT_USE_LLM"] = "0"
os.environ["RISK_AGENT_USE_LLM"] = "0"
os.environ["QUALITY_AGENT_USE_LLM"] = "0"
os.environ["STRATEGY_AGENT_USE_LLM"] = "0"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv(Path(__file__).resolve().parent / ".env")

from orchestration.workflow import human_review_node
from app.agents.quality_agent import quality_agent
from app.agents.verification_agent import verification_agent
from app.core.agent_runner import run_node
from app.services.context_manager import select_evidence_context


def _evidence():
    return {
        "evidence_id": "EV001",
        "platform": "罗技",
        "related_dimension": "重量",
        "credibility": "high",
        "confidence_score": 0.9,
        "claim": "罗技鼠标重量为 60 克。",
        "raw_content": "官方资料显示罗技鼠标重量为 60 克。",
    }


def _base_state():
    matrix = {
        "dimensions": {
            "重量": {
                "罗技": {
                    "score": 4,
                    "summary": "罗技鼠标重量为 60 克。",
                    "analysis": "罗技鼠标重量为 60 克。",
                    "evidence_ids": ["EV001"],
                    "confidence_score": 0.9,
                }
            }
        }
    }
    return {
        "industry_key": "gaming_mouse",
        "industry_name": "电竞鼠标",
        "target_platform": "罗技",
        "competitors": ["罗技"],
        "analysis_scene": "测试",
        "target_user": "测试",
        "time_range": "近12个月",
        "focus_dimensions": ["重量"],
        "raw_research": [],
        "evidence_list": [_evidence()],
        "claims": [
            {
                "claim_id": "PCL001",
                "content": "罗技鼠标重量为 60 克。",
                "dimension": "重量",
                "related_platforms": ["罗技"],
                "evidence_ids": ["EV001"],
                "confidence_score": 0.9,
                "generated_by": "ProductAgent",
            }
        ],
        "product_matrix": matrix,
        "business_matrix": matrix,
        "risk_flags": [],
        "faithfulness_report": {},
        "unsupported_claim_ids": [],
        "quality_result": {},
        "final_report": {},
        "context_summary": {},
        "review_ticket": {},
        "trace_log": [],
        "error_log": [],
        "metrics": {},
        "used_claim_ids": [],
        "used_evidence_ids": [],
        "current_agent": "",
        "iteration_count": 0,
        "rejected_agents": [],
        "is_approved": False,
        "needs_human_review": False,
        "quality_status": "",
    }


def test_context_summary_observable():
    evidence_list = [
        {**_evidence(), "evidence_id": f"EV{index:03d}", "raw_content": "x" * 80}
        for index in range(1, 6)
    ]
    selected, summary = select_evidence_context(
        "ProductAgent",
        evidence_list,
        max_items=2,
        max_per_dimension=2,
        max_content_chars=20,
    )
    assert len(selected) == 2
    assert summary["total_evidence_count"] == 5
    assert summary["selected_evidence_count"] == 2
    assert summary["trimmed_evidence_count"] == 3
    assert len(summary["selected_evidence_ids"]) == 2


def test_unsupported_claim_rejected():
    state = _base_state()
    state["claims"][0]["content"] = "罗技鼠标重量为 73 克。"

    verified = verification_agent(state)
    assert verified["unsupported_claim_ids"] == ["PCL001"]

    checked = quality_agent(verified)
    quality_result = checked["quality_result"]
    assert quality_result["status"] == "rejected"
    assert "all_claims_faithful" in quality_result["failed_checks"]
    assert quality_result["target_agent"] == "ProductAgent"


def test_matrix_issue_rejected():
    state = _base_state()
    state["product_matrix"]["dimensions"]["重量"]["罗技"]["analysis"] = "罗技鼠标重量为 73 克。"

    verified = verification_agent(state)
    assert verified["faithfulness_report"]["matrix_issues"]

    checked = quality_agent(verified)
    quality_result = checked["quality_result"]
    assert quality_result["status"] == "rejected"
    assert "all_matrix_claims_faithful" in quality_result["failed_checks"]
    assert quality_result["matrix_issues"]


def test_review_ticket_after_three_failures():
    state = _base_state()
    state["product_matrix"]["dimensions"]["重量"]["罗技"]["analysis"] = "罗技鼠标重量为 73 克。"
    state["iteration_count"] = 2

    verified = verification_agent(state)
    checked = quality_agent(verified)
    assert checked["needs_human_review"] is True

    reviewed = human_review_node(checked)
    ticket = reviewed["review_ticket"]
    assert ticket["ticket_id"].startswith("RT-")
    assert ticket["status"] == "open"
    assert ticket["matrix_issues"]
    assert reviewed["final_report"]["review_ticket"]["ticket_id"] == ticket["ticket_id"]


def test_structured_error_recovery():
    def _broken_agent(_state):
        raise RuntimeError("boom")

    recovered = run_node("BrokenAgent", _broken_agent, _base_state())
    assert recovered["trace_log"][0]["status"] == "failed"
    error = recovered["error_log"][0]
    assert error["agent_name"] == "BrokenAgent"
    assert error["error_type"] == "agent_failed"
    assert error["recover_action"] == "degrade_and_continue"


if __name__ == "__main__":
    test_context_summary_observable()
    test_unsupported_claim_rejected()
    test_matrix_issue_rejected()
    test_review_ticket_after_three_failures()
    test_structured_error_recovery()
    print("Failure-path 测试通过")
