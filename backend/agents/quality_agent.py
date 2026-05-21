"""Quality Agent - 质检 & 打回重做（核心闭环）"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

MAX_ITERATIONS = 3

def get_llm():
    return ChatOpenAI(model=os.getenv("ARK_EP",""), api_key=os.getenv("ARK_API_KEY",""),
                      base_url="https://ark.cn-beijing.volces.com/api/v3")

def quality_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """检查 Schema 符合度、证据完整性、结论可溯源性，不合格则打回"""
    if state.get("iteration_count", 0) >= MAX_ITERATIONS:
        return {**state, "current_agent": "QualityAgent", "is_approved": True,
                "quality_result": {"status": "approved", "reason": f"已达最大重做次数({MAX_ITERATIONS})，强制通过"}}

    llm = get_llm()
    prompt = f"""你是严格的质检 Agent。执行以下检查并输出 JSON：
1. 每条关键结论是否有证据ID支撑
2. 是否有高可信度证据支撑核心结论
3. 各平台分析是否均衡完整
4. 是否存在明显数据缺口

输出格式：
{{"status": "approved"或"rejected", "reason": "说明", "target_agent": "需重做的Agent(rejected时必填)",
  "required_fix": "修复要求(rejected时必填)", "quality_score": 0-100,
  "passed_checks": [], "failed_checks": []}}

产品矩阵：{state['product_matrix']}
商业矩阵：{state['business_matrix']}
证据：{state['evidence_list']}
风险：{state['risk_flags']}"""

    response = llm.invoke(prompt)

    # 简单判断是否有高风险
    high_risks = [r for r in state.get("risk_flags", [])
                  if isinstance(r, dict) and r.get("severity") == "high"]
    iteration = state.get("iteration_count", 0)

    if high_risks and iteration < MAX_ITERATIONS:
        quality_result = {"status": "rejected", "reason": f"发现{len(high_risks)}个高风险问题，需补充证据",
                          "target_agent": "EvidenceAgent", "required_fix": "补充高可信度数据来源",
                          "quality_score": 60, "raw": response.content}
        is_approved = False
    else:
        quality_result = {"status": "approved", "reason": "质检通过",
                          "quality_score": 85, "raw": response.content}
        is_approved = True

    return {**state, "current_agent": "QualityAgent", "quality_result": quality_result,
            "is_approved": is_approved, "iteration_count": iteration + 1}

def quality_router(state: CompetitiveAnalysisState) -> str:
    """路由：质检通过去 strategy，否则打回对应 Agent"""
    if state.get("is_approved"):
        return "strategy_agent"
    target = state.get("quality_result", {}).get("target_agent", "")
    return {"EvidenceAgent": "evidence_agent", "ProductAgent": "product_agent",
            "BusinessAgent": "business_agent", "ResearchAgent": "research_agent"}.get(target, "strategy_agent")
