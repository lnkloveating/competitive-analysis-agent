import os
import sys
from pathlib import Path

from dotenv import load_dotenv

os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
# os.environ["RESEARCH_AGENT_USE_LLM"] = "0"
# os.environ["EVIDENCE_AGENT_USE_LLM"] = "0"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv(Path(__file__).resolve().parent / ".env")

from agents.research_agent import research_agent
from agents.evidence_agent import evidence_agent
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
    print("=== 测试 ResearchAgent ===")
    result = research_agent(initial_state)
    raw_research = result["raw_research"]

    print(f"采集条数: {len(raw_research)}")
    assert raw_research, "raw_research 不能为空"

    first = raw_research[0]
    print(f"platform: {first.get('platform')}")
    print(f"dimension: {first.get('dimension')}")
    print(f"content: {first.get('content')}")

    for field in ("platform", "dimension", "content"):
        assert first.get(field), f"第一条数据缺少字段: {field}"

    print("ResearchAgent 测试通过")

    print("\n=== 测试 EvidenceAgent ===")
    evidence_result = evidence_agent(result)
    evidence_list = evidence_result["evidence_list"]

    print(f"证据条数: {len(evidence_list)}")
    assert evidence_list, "evidence_list 不能为空"

    first_evidence = evidence_list[0]
    print(f"evidence_id: {first_evidence.get('evidence_id')}")
    print(f"platform: {first_evidence.get('platform')}")
    print(f"claim: {first_evidence.get('claim')}")
    print(f"credibility: {first_evidence.get('credibility')}")

    for field in ("evidence_id", "platform", "claim", "credibility"):
        assert first_evidence.get(field), f"第一条证据缺少字段: {field}"

    assert first_evidence["credibility"] in {"high", "medium", "low"}, "credibility 值非法"
    print("EvidenceAgent 测试通过")
