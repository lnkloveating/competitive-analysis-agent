"""Strategy Agent - 最终报告生成（Executive Summary / SWOT / 排名 / 路线图）"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

def get_llm():
    return ChatOpenAI(model=os.getenv("ARK_EP",""), api_key=os.getenv("ARK_API_KEY",""),
                      base_url="https://ark.cn-beijing.volces.com/api/v3")

def strategy_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """生成结构化竞品战略分析报告"""
    llm = get_llm()
    prompt = f"""你是战略分析 Agent，生成最终竞品战略报告（JSON格式）：
1. executive_summary: 执行摘要（300字内）
2. competitive_ranking: 各平台综合排名和评分
3. swot_analysis: 目标平台SWOT
4. dimension_matrix: 各维度对比矩阵
5. opportunities: 3-5个市场机会点
6. strategic_recommendations: 3-5条战略建议
7. roadmap: 产品路线图（3-6个月）
8. data_confidence: 整体数据置信度说明

目标：{state['target_platform']} vs {state['competitors']}
场景：{state['analysis_scene']} | 用户：{state['target_user']}
产品分析：{state['product_matrix']}
商业分析：{state['business_matrix']}"""
    response = llm.invoke(prompt)
    final_report = {"raw": response.content, "generated_at": "2025-05-21",
                    "quality_score": state.get("quality_result", {}).get("quality_score", 0),
                    "evidence_count": len(state.get("evidence_list", [])),
                    "iteration_count": state.get("iteration_count", 0)}
    return {**state, "current_agent": "StrategyAgent", "final_report": final_report}
