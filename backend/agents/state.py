from typing import Annotated, TypedDict, List, Dict


def latest_current_agent(left: str, right: str) -> str:
    return right or left


class CompetitiveAnalysisState(TypedDict):
    target_platform: str
    competitors: List[str]
    analysis_scene: str
    target_user: str
    time_range: str
    focus_dimensions: List[str]
    raw_research: List[Dict]
    evidence_list: List[Dict]
    product_matrix: Dict
    business_matrix: Dict
    risk_flags: List[Dict]
    quality_result: Dict
    final_report: Dict
    current_agent: Annotated[str, latest_current_agent]
    iteration_count: int
    rejected_agents: List[str]
    is_approved: bool
    error_log: List[str]
