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

from orchestration.workflow import app
from test_workflow import initial_state


def _assert_subset(values, valid_values, label):
    missing = [value for value in values if value not in valid_values]
    assert not missing, f"{label} 存在无效 ID: {missing}"


if __name__ == "__main__":
    final_state = app.invoke(dict(initial_state), {"recursion_limit": 50})

    claims = final_state.get("claims", [])
    evidence_list = final_state.get("evidence_list", [])
    trace_log = final_state.get("trace_log", [])
    final_report = final_state.get("final_report", {})

    assert claims, "workflow 运行后 state 中应该有 claims"
    assert trace_log, "workflow 运行后 state 中应该有 trace_log"
    assert final_report, "workflow 运行后 final_report 不应为空"

    evidence_ids = {
        evidence.get("evidence_id")
        for evidence in evidence_list
        if isinstance(evidence, dict) and evidence.get("evidence_id")
    }
    claim_ids = {
        claim.get("claim_id")
        for claim in claims
        if isinstance(claim, dict) and claim.get("claim_id")
    }

    for claim in claims:
        if not isinstance(claim, dict):
            continue
        _assert_subset(claim.get("evidence_ids", []), evidence_ids, "claim.evidence_ids")

    _assert_subset(final_report.get("used_claim_ids", []), claim_ids, "final_report.used_claim_ids")
    _assert_subset(final_report.get("used_evidence_ids", []), evidence_ids, "final_report.used_evidence_ids")
    _assert_subset(final_state.get("used_claim_ids", []), claim_ids, "state.used_claim_ids")
    _assert_subset(final_state.get("used_evidence_ids", []), evidence_ids, "state.used_evidence_ids")

    for recommendation in final_report.get("strategic_recommendations", []):
        if not isinstance(recommendation, dict):
            continue
        _assert_subset(
            recommendation.get("supporting_claim_ids", []),
            claim_ids,
            "recommendation.supporting_claim_ids",
        )
        _assert_subset(
            recommendation.get("supporting_evidence_ids", []),
            evidence_ids,
            "recommendation.supporting_evidence_ids",
        )

    expected_trace_agents = {
        "ResearchAgent",
        "EvidenceAgent",
        "ProductAgent",
        "BusinessAgent",
        "VerificationAgent",
        "RiskAgent",
        "QualityAgent",
    }
    trace_agents = {
        item.get("agent_name")
        for item in trace_log
        if isinstance(item, dict) and item.get("agent_name")
    }
    assert expected_trace_agents.issubset(trace_agents), f"trace_log 缺少 Agent: {expected_trace_agents - trace_agents}"
    assert {"StrategyAgent", "HumanReviewRequired"} & trace_agents, "trace_log 缺少 StrategyAgent 或 HumanReviewRequired"

    old_report_fields = {"executive_summary", "competitive_ranking", "swot_analysis"}
    new_report_fields = {
        "competitor_ranking",
        "swot",
        "strategic_recommendations",
        "risk_disclosure",
        "used_claim_ids",
        "used_evidence_ids",
        "quality_result",
        "metrics",
    }
    assert old_report_fields.issubset(final_report), f"final_report 缺少旧字段: {old_report_fields - set(final_report)}"
    assert new_report_fields.issubset(final_report), f"final_report 缺少新字段: {new_report_fields - set(final_report)}"

    if final_state.get("needs_human_review") or final_state.get("quality_result", {}).get("approved") is False:
        assert final_report.get("needs_human_review") is True, "待人工审核状态下 final_report 必须是草稿"
        assert final_report.get("quality_status") in {
            "requires_human_review",
            "rejected_after_max_iterations",
        }, "待人工审核状态下 final_report 不得标记为正式 approved"
    else:
        assert final_report.get("quality_status") == "approved", "质检通过时 final_report 应为 approved"

    context_summary = final_state.get("context_summary", {})
    assert isinstance(context_summary, dict) and context_summary, "state 应包含 context_summary"
    assert "ProductAgent" in context_summary, "context_summary 缺少 ProductAgent"
    assert "BusinessAgent" in context_summary, "context_summary 缺少 BusinessAgent"

    print("Traceability 测试通过")
