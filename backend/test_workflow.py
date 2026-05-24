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

from agents.workflow import app
from agents.state import CompetitiveAnalysisState


initial_state: CompetitiveAnalysisState = {
    "target_platform": "腾讯视频",
    "competitors": ["爱奇艺"],
    "analysis_scene": "长视频平台会员增长与内容生态战略分析",
    "target_user": "视频平台产品经理",
    "time_range": "近 12 个月",
    "focus_dimensions": ["内容生态", "会员体系", "商业模式", "推荐系统"],
    "raw_research": [],
    "evidence_list": [],
    "product_matrix": {},
    "business_matrix": {},
    "risk_flags": [],
    "quality_result": {},
    "final_report": {},
    "current_agent": "",
    "iteration_count": 0,
    "rejected_agents": [],
    "is_approved": False,
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
