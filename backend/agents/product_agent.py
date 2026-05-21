"""Product Agent - 产品功能矩阵分析（内容/推荐/体验/社区/技术）"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

def get_llm():
    return ChatOpenAI(model=os.getenv("ARK_EP",""), api_key=os.getenv("ARK_API_KEY",""),
                      base_url="https://ark.cn-beijing.volces.com/api/v3")

def product_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """分析各平台产品功能维度，输出对比矩阵"""
    llm = get_llm()
    prompt = f"""你是产品分析 Agent，专注长视频平台产品功能对比。
基于证据分析各平台差异，输出 JSON 矩阵（每维度评分1-5 + 说明 + 证据ID）：
- content_ecosystem: 内容生态
- recommendation: 推荐系统
- user_experience: 用户体验
- community: 社区功能
- technical: 技术能力

证据：{state['evidence_list']}
分析对象：{state['target_platform']} vs {state['competitors']}"""
    response = llm.invoke(prompt)
    return {**state, "current_agent": "ProductAgent", "product_matrix": {"raw": response.content}}
