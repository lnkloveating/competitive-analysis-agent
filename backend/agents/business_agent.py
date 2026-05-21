"""Business Agent - 商业模式 & 会员体系分析"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

def get_llm():
    return ChatOpenAI(model=os.getenv("ARK_EP",""), api_key=os.getenv("ARK_API_KEY",""),
                      base_url="https://ark.cn-beijing.volces.com/api/v3")

def business_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """分析会员体系、定价、版权、国际化、收入模式"""
    llm = get_llm()
    prompt = f"""你是商业分析 Agent，专注长视频平台商业模式对比。
基于证据输出 JSON 矩阵（每维度含分析结论 + 证据ID）：
- membership: 会员体系
- pricing_strategy: 定价策略
- content_rights: 版权模式
- internationalization: 国际化布局
- revenue_model: 收入来源

证据：{state['evidence_list']}
目标用户：{state['target_user']}"""
    response = llm.invoke(prompt)
    return {**state, "current_agent": "BusinessAgent", "business_matrix": {"raw": response.content}}
