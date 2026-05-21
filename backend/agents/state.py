from typing import TypedDict, List, Dict, Optional

class CompetitiveAnalysisState(TypedDict):
    # 输入
    target_platform: str
    competitors: List[str]
    analysis_scene: str
    target_user: str
    time_range: str
    focus_dimensions: List[str]
    # 各 Agent 输出
    raw_research: List[Dict]
    evidence_list: List[Dict]
    product_matrix: Dict
    business_matrix: Dict
    risk_flags: List[Dict]
    quality_result: Dict
    final_report: Dict
    # 流程控制
    current_agent: str
    iteration_count: int
    rejected_agents: List[str]
    is_approved: bool
    error_log: List[str]
