"""
LangGraph workflow for the 7-agent competitive analysis system.

DAG:
Research -> Evidence -> [Product, Business] -> Risk -> Quality
Quality rejected -> target agent
Quality approved -> Strategy -> END
"""

from langgraph.graph import END, StateGraph

from app.services.metrics_service import calculate_report_metrics

from .business_agent import business_agent
from .evidence_agent import evidence_agent
from .product_agent import product_agent
from .quality_agent import quality_agent, quality_router
from .research_agent import research_agent
from .risk_agent import risk_agent
from .state import CompetitiveAnalysisState
from .strategy_agent import strategy_agent


def human_review_node(state: CompetitiveAnalysisState) -> dict:
    """Stop automatic routing after repeated quality rejection."""
    quality_result = state.get("quality_result", {})
    risk_flags = state.get("risk_flags", [])
    metrics = calculate_report_metrics(state)
    trace_log = list(state.get("trace_log", []))
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "HumanReviewRequired",
            "status": "rejected",
            "output_summary": "automatic retries exhausted; human review required",
            "error": None,
        }
    )

    return {
        **state,
        "current_agent": "HumanReviewRequired",
        "is_approved": False,
        "needs_human_review": True,
        "quality_status": "rejected_after_max_iterations",
        "metrics": metrics,
        "used_claim_ids": state.get("used_claim_ids", []),
        "used_evidence_ids": state.get("used_evidence_ids", []),
        "trace_log": trace_log,
        "final_report": {
            "quality_status": "rejected_after_max_iterations",
            "needs_human_review": True,
            "auto_approved": False,
            "executive_summary": [
                "系统已完成自动分析流程，但质量检查在 3 次自动修复后仍未通过。",
                "当前报告仅作为低置信草稿，不建议直接用于正式业务决策。",
                "请人工根据 required_actions 补充或修正证据后重新运行分析。",
            ],
            "quality_result": quality_result,
            "risk_flags": risk_flags,
            "missing_dimensions": quality_result.get("missing_dimensions", []),
            "missing_platforms": quality_result.get("missing_platforms", []),
            "required_actions": quality_result.get("required_actions", []),
            "used_claim_ids": state.get("used_claim_ids", []),
            "used_evidence_ids": state.get("used_evidence_ids", []),
            "metrics": metrics,
            "draft_product_matrix": state.get("product_matrix", {}),
            "draft_business_matrix": state.get("business_matrix", {}),
            "draft_claims": state.get("claims", []),
            "disclaimer": "This report requires human review before use.",
        },
    }


def product_agent_node(state: CompetitiveAnalysisState) -> dict:
    """Run ProductAgent in a parallel branch and return only its owned updates."""
    result = product_agent(state)
    return {
        "current_agent": result.get("current_agent", "ProductAgent"),
        "product_matrix": result.get("product_matrix", {}),
        "claims": result.get("claims", []),
        "trace_log": result.get("trace_log", []),
    }


def business_agent_node(state: CompetitiveAnalysisState) -> dict:
    """Run BusinessAgent in a parallel branch and return only its owned updates."""
    result = business_agent(state)
    return {
        "current_agent": result.get("current_agent", "BusinessAgent"),
        "business_matrix": result.get("business_matrix", {}),
        "claims": result.get("claims", []),
        "trace_log": result.get("trace_log", []),
    }


def build_workflow():
    workflow = StateGraph(CompetitiveAnalysisState)

    workflow.add_node("research_agent", research_agent)
    workflow.add_node("evidence_agent", evidence_agent)
    workflow.add_node("product_agent", product_agent_node)
    workflow.add_node("business_agent", business_agent_node)
    workflow.add_node("risk_agent", risk_agent)
    workflow.add_node("quality_agent", quality_agent)
    workflow.add_node("strategy_agent", strategy_agent)
    workflow.add_node("human_review", human_review_node)

    workflow.set_entry_point("research_agent")

    workflow.add_edge("research_agent", "evidence_agent")
    workflow.add_edge("evidence_agent", "product_agent")
    workflow.add_edge("evidence_agent", "business_agent")
    workflow.add_edge("product_agent", "risk_agent")
    workflow.add_edge("business_agent", "risk_agent")
    workflow.add_edge("risk_agent", "quality_agent")
    workflow.add_conditional_edges(
        "quality_agent",
        quality_router,
        {
            "evidence_agent": "evidence_agent",
            "product_agent": "product_agent",
            "business_agent": "business_agent",
            "research_agent": "research_agent",
            "strategy_agent": "strategy_agent",
            "risk_agent": "risk_agent",
            "human_review": "human_review",
        },
    )
    workflow.add_edge("strategy_agent", END)
    workflow.add_edge("human_review", END)

    return workflow


app = build_workflow().compile()
