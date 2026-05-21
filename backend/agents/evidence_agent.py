"""Evidence Agent - 证据结构化 & 可信度评分"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

def get_llm():
    return ChatOpenAI(model=os.getenv("ARK_EP",""), api_key=os.getenv("ARK_API_KEY",""),
                      base_url="https://ark.cn-beijing.volces.com/api/v3")

def evidence_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """将原始信息结构化为 Evidence Schema，打可信度标签"""
    llm = get_llm()
    prompt = f"""你是证据结构化 Agent。
将以下原始信息转化为结构化证据，按 Evidence Schema 输出，并打可信度标签（high/medium/low）：
- high：官网、上市公司财报、权威媒体
- medium：行业报告、知名媒体  
- low：用户评论、社交媒体

原始信息：{state['raw_research']}"""
    response = llm.invoke(prompt)
    evidence_list = state.get("evidence_list", []) + [{"raw": response.content}]
    return {**state, "current_agent": "EvidenceAgent", "evidence_list": evidence_list}
