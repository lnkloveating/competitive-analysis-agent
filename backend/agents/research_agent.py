"""Research Agent - 公开信息采集"""
import os
from langchain_openai import ChatOpenAI
from .state import CompetitiveAnalysisState

def get_llm():
    return ChatOpenAI(
        model=os.getenv("ARK_EP", ""),
        api_key=os.getenv("ARK_API_KEY", ""),
        base_url="https://ark.cn-beijing.volces.com/api/v3",
    )

def research_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    """从官网、新闻、财报、App Store 采集公开信息"""
    llm = get_llm()
    prompt = f"""你是信息采集 Agent。针对以下任务采集关键信息：
目标平台：{state['target_platform']}
竞品：{', '.join(state['competitors'])}
时间范围：{state['time_range']}
维度：{', '.join(state['focus_dimensions'])}

输出 JSON 列表，每条包含 content/source_url/source_type/platform/publish_time/dimension。"""
    response = llm.invoke(prompt)
    # TODO: 替换为真实网络采集
    raw_research = [{"content": response.content, "source_url": "", "source_type": "news",
                     "platform": state["target_platform"], "publish_time": "", "dimension": "content_ecosystem"}]
    return {**state, "current_agent": "ResearchAgent", "raw_research": raw_research}
