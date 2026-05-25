from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class QualityResult(BaseModel):
    approved: bool
    score: float = Field(ge=0, le=100)
    reject_to: Optional[
        Literal[
            "ResearchAgent",
            "EvidenceAgent",
            "ProductAgent",
            "BusinessAgent",
            "RiskAgent",
            "StrategyAgent",
        ]
    ] = None
    reject_reason: Optional[str] = None
    missing_dimensions: List[str] = Field(default_factory=list)
    missing_platforms: List[str] = Field(default_factory=list)
    required_actions: List[str] = Field(default_factory=list)
    checked_items: Dict[str, bool] = Field(default_factory=dict)
