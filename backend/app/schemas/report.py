from typing import Any, Dict, List

from pydantic import BaseModel


class StrategyRecommendation(BaseModel):
    recommendation: str
    supporting_claim_ids: List[str]
    supporting_evidence_ids: List[str]


class StrategyAgentOutput(BaseModel):
    final_report: Dict[str, Any]
    used_claim_ids: List[str]
    used_evidence_ids: List[str]
