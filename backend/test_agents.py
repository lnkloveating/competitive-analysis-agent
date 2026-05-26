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

from agents.research_agent import research_agent
from agents.evidence_agent import evidence_agent
from agents.product_agent import product_agent
from agents.business_agent import business_agent
from agents.risk_agent import risk_agent
from agents.quality_agent import quality_agent, quality_router
from agents.strategy_agent import strategy_agent
from agents.state import CompetitiveAnalysisState


initial_state: CompetitiveAnalysisState = {
    "industry_key": "gaming_mouse",
    "industry_name": "电竞鼠标",
    "target_platform": "罗技",
    "competitors": ["雷蛇", "海盗船"],
    "analysis_scene": "电竞鼠标产品竞争格局与增长策略分析",
    "target_user": "电竞鼠标产品经理",
    "time_range": "近 12 个月",
    "focus_dimensions": ["性能参数", "轻量化设计", "无线与续航", "软件生态", "用户口碑", "价格定位", "电竞品牌影响力"],
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

    print("\n=== 测试 ProductAgent ===")
    product_result = product_agent(evidence_result)
    product_matrix = product_result["product_matrix"]

    print(f"产品矩阵维度数: {len(product_matrix.get('dimensions', {}))}")
    assert product_matrix, "product_matrix 不能为空"
    assert "dimensions" in product_matrix, "product_matrix 缺少 dimensions 字段"

    non_empty_dimensions = [
        dimension
        for dimension, platform_map in product_matrix["dimensions"].items()
        if platform_map
    ]
    print(f"有数据的维度: {non_empty_dimensions}")
    assert non_empty_dimensions, "至少一个维度需要有数据"

    print("ProductAgent 测试通过")

    print("\n=== 测试 BusinessAgent ===")
    business_result = business_agent(product_result)
    business_matrix = business_result["business_matrix"]

    print(f"商业矩阵维度数: {len(business_matrix.get('dimensions', {}))}")
    assert business_matrix, "business_matrix 不能为空"
    assert "dimensions" in business_matrix, "business_matrix 缺少 dimensions 字段"

    non_empty_business_dimensions = [
        dimension
        for dimension, platform_map in business_matrix["dimensions"].items()
        if platform_map
    ]
    assert non_empty_business_dimensions, "至少一个商业维度需要有数据"

    first_dimension_name = non_empty_business_dimensions[0]
    first_platform_count = len(business_matrix["dimensions"][first_dimension_name])
    print(f"第一个商业维度: {first_dimension_name}")
    print(f"平台数量: {first_platform_count}")

    print("BusinessAgent 测试通过")

    print("\n=== 测试 RiskAgent ===")
    risk_result = risk_agent(business_result)
    risk_flags = risk_result["risk_flags"]

    print(f"风险数量: {len(risk_flags)}")
    assert isinstance(risk_flags, list), "risk_flags 必须是列表"

    for risk in risk_flags:
        for field in ("risk_id", "risk_type", "severity"):
            assert risk.get(field), f"风险记录缺少字段: {field}"
        assert risk["severity"] in {"high", "medium", "low"}, "severity 值非法"

    if risk_flags:
        print(f"第一条风险类型: {risk_flags[0].get('risk_type')}")

    print("RiskAgent 测试通过")

    print("\n=== 测试 QualityAgent ===")
    quality_result_state = quality_agent(risk_result)
    quality_result = quality_result_state["quality_result"]

    assert quality_result, "quality_result 不能为空"
    assert quality_result.get("status") in {"approved", "rejected"}, "status 值非法"
    assert "quality_score" in quality_result, "quality_result 缺少 quality_score 字段"

    print(f"status: {quality_result.get('status')}")
    print(f"reason: {quality_result.get('reason')}")
    print(f"quality_score: {quality_result.get('quality_score')}")
    print(f"router: {quality_router(quality_result_state)}")

    if quality_result["status"] == "rejected":
        print(f"target_agent: {quality_result.get('target_agent')}")
        print(f"required_fix: {quality_result.get('required_fix')}")
        assert quality_result.get("target_agent"), "rejected 时必须包含 target_agent"
        assert quality_result.get("required_fix"), "rejected 时必须包含 required_fix"

    print("QualityAgent 测试通过")

    print("\n=== 测试 StrategyAgent ===")
    strategy_result = strategy_agent(quality_result_state)
    final_report = strategy_result["final_report"]

    assert final_report, "final_report 不能为空"
    for field in ("executive_summary", "competitive_ranking", "swot_analysis"):
        assert field in final_report, f"final_report 缺少字段: {field}"
    assert isinstance(final_report["competitive_ranking"], list), "competitive_ranking 必须是列表"
    assert final_report["competitive_ranking"], "competitive_ranking 不能为空"
    assert "strengths" in final_report["swot_analysis"], "swot_analysis 缺少 strengths 字段"

    print(f"executive_summary 前100字: {final_report['executive_summary'][:100]}")
    print("StrategyAgent 测试通过")
