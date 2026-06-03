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
from orchestration.state import CompetitiveAnalysisState


initial_state: CompetitiveAnalysisState = {
    "industry_key": "gaming_mouse",
    "industry_name": "电竞鼠标",
    "target_platform": "罗技",
    "competitors": ["雷蛇", "海盗船"],
    "analysis_scene": "电竞鼠标产品竞争格局与增长策略分析",
    "target_user": "电竞鼠标产品经理",
    "time_range": "近 12 个月",
    "focus_dimensions": ["性能参数", "轻量化设计", "无线与续航", "软件生态", "用户口碑", "价格定位", "电竞品牌影响力", "握持手感与人体工学"],
    "raw_research": [],
    "evidence_list": [],
    "claims": [],
    "product_matrix": {},
    "business_matrix": {},
    "risk_flags": [],
    "faithfulness_report": {},
    "unsupported_claim_ids": [],
    "quality_result": {},
    "final_report": {},
    "context_summary": {},
    "review_ticket": {},
    "trace_log": [],
    "metrics": {},
    "used_claim_ids": [],
    "used_evidence_ids": [],
    "current_agent": "",
    "iteration_count": 0,
    "rejected_agents": [],
    "is_approved": False,
    "needs_human_review": False,
    "quality_status": "",
    "error_log": [],
}


if __name__ == "__main__":
    print("=== 测试 LangGraph Workflow ===")
    final_state = dict(initial_state)

    for event in app.stream(
        initial_state,
        {"recursion_limit": 50},
        stream_mode="updates",
    ):
        for node_name, update in event.items():
            if not isinstance(update, dict):
                continue
            final_state.update(update)
            current_agent = update.get("current_agent") or node_name
            print(f"{node_name} 执行完成，current_agent: {current_agent}")

    final_report = final_state.get("final_report", {})
    quality_result = final_state.get("quality_result", {})

    assert final_report, "final_report 不能为空"
    assert final_report.get("competitive_ranking"), "competitive_ranking 不能为空"

    print(f"quality_status: {quality_result.get('status')}")
    print(f"quality_score: {quality_result.get('quality_score')}")
    print(f"executive_summary 前100字: {final_report.get('executive_summary', '')[:100]}")
    print("Workflow 测试通过")
