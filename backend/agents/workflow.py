"""
LangGraph Workflow - 7个Agent编排
DAG: Research → Evidence → [Product, Business] → Risk → Quality ⇄ 打回 → Strategy
"""
from langgraph.graph import StateGraph, END
from .state import CompetitiveAnalysisState
from .research_agent import research_agent
from .evidence_agent import evidence_agent
from .product_agent import product_agent
from .business_agent import business_agent
from .risk_agent import risk_agent
from .quality_agent import quality_agent, quality_router
from .strategy_agent import strategy_agent

def build_workflow():
    workflow = StateGraph(CompetitiveAnalysisState)

    # 注册节点
    workflow.add_node("research_agent", research_agent)
    workflow.add_node("evidence_agent", evidence_agent)
    workflow.add_node("product_agent", product_agent)
    workflow.add_node("business_agent", business_agent)
    workflow.add_node("risk_agent", risk_agent)
    workflow.add_node("quality_agent", quality_agent)
    workflow.add_node("strategy_agent", strategy_agent)

    # 入口
    workflow.set_entry_point("research_agent")

    # 边定义
    workflow.add_edge("research_agent", "evidence_agent")
    workflow.add_edge("evidence_agent", "product_agent")
    workflow.add_edge("evidence_agent", "business_agent")
    workflow.add_edge("product_agent", "risk_agent")
    workflow.add_edge("business_agent", "risk_agent")
    workflow.add_edge("risk_agent", "quality_agent")
    workflow.add_edge("strategy_agent", END)

    # 质检路由（打回闭环核心）
    workflow.add_conditional_edges(
        "quality_agent",
        quality_router,
        {
            "evidence_agent": "evidence_agent",
            "product_agent": "product_agent",
            "business_agent": "business_agent",
            "research_agent": "research_agent",
            "strategy_agent": "strategy_agent",
        }
    )

    return workflow.compile()

app = build_workflow()
