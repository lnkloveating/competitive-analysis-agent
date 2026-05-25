from typing import Annotated, Any, Dict, List, TypedDict

from app.schemas.claim import Claim
from app.schemas.evidence import EvidenceItem
from app.schemas.metrics import ReportMetrics
from app.schemas.quality import QualityResult
from app.schemas.research import RawResearchItem
from app.schemas.risk import RiskFlag
from app.schemas.trace import AgentTrace


def latest_current_agent(left: str, right: str) -> str:
    return right or left


class CompetitiveAnalysisState(TypedDict, total=False):
    target_platform: str
    competitors: List[str]
    analysis_scene: str
    target_user: str
    time_range: str
    focus_dimensions: List[str]
    industry_key: str
    industry_name: str

    raw_research: List[Dict[str, Any]]
    evidence_list: List[Dict[str, Any]]
    claims: List[Dict[str, Any]]
    product_matrix: Dict[str, Any]
    business_matrix: Dict[str, Any]
    risk_flags: List[Dict[str, Any]]
    quality_result: Dict[str, Any]
    final_report: Dict[str, Any]
    metrics: Dict[str, Any]

    current_agent: Annotated[str, latest_current_agent]
    iteration_count: int
    rejected_agents: List[str]
    is_approved: bool
    error_log: List[Dict[str, Any]]
    trace_log: List[Dict[str, Any]]


__all__ = [
    "AgentTrace",
    "Claim",
    "CompetitiveAnalysisState",
    "EvidenceItem",
    "QualityResult",
    "RawResearchItem",
    "ReportMetrics",
    "RiskFlag",
    "latest_current_agent",
]
