"""
LangGraph workflow for the 7-agent competitive analysis system.

DAG:
Research -> Evidence -> [Product, Business] -> Risk -> Quality
Quality rejected -> target agent
Quality approved -> Strategy -> END
"""

from langgraph.graph import END, StateGraph

from .business_agent import business_agent
from .evidence_agent import evidence_agent
from .product_agent import product_agent
from .quality_agent import quality_agent, quality_router
from .research_agent import research_agent
from .risk_agent import risk_agent
from .state import CompetitiveAnalysisState
from .strategy_agent import strategy_agent


def product_agent_node(state: CompetitiveAnalysisState) -> dict:
    """Run ProductAgent in a parallel branch and return only its owned updates."""
    result = product_agent(state)
    return {
        "current_agent": result.get("current_agent", "ProductAgent"),
        "product_matrix": result.get("product_matrix", {}),
    }


def business_agent_node(state: CompetitiveAnalysisState) -> dict:
    """Run BusinessAgent in a parallel branch and return only its owned updates."""
    result = business_agent(state)
    return {
        "current_agent": result.get("current_agent", "BusinessAgent"),
        "business_matrix": result.get("business_matrix", {}),
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
        },
    )
    workflow.add_edge("strategy_agent", END)

    return workflow


app = build_workflow().compile()
