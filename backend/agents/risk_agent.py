"""Risk Agent - 风险识别 & 数据质量检查"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

def get_llm():
    return ChatOpenAI(model=os.getenv("ARK_EP",""), api_key=os.getenv("ARK_API_KEY",""),
                      base_url="https://ark.cn-beijing.volces.com/api/v3")

def risk_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """识别数据质量、时效性、证据不足、合规风险"""
    llm = get_llm()
    prompt = f"""你是风险识别 Agent。检查以下分析结论，识别风险并输出 JSON 列表：
风险类型：数据可信度/时效性/证据不足/版权合规
每条包含：risk_type/description/affected_conclusion/severity(high/medium/low)/suggestion

产品矩阵：{state['product_matrix']}
商业矩阵：{state['business_matrix']}
证据列表：{state['evidence_list']}"""
    response = llm.invoke(prompt)
    return {**state, "current_agent": "RiskAgent", "risk_flags": [{"raw": response.content}]}
