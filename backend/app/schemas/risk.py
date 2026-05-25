from typing import List, Literal

from pydantic import BaseModel, Field


class RiskFlag(BaseModel):
    risk_type: Literal["data_credibility", "data_timeliness", "evidence_gap", "compliance"]
    description: str
    severity: Literal["low", "medium", "high"]
    related_platforms: List[str] = Field(default_factory=list)
    related_dimensions: List[str] = Field(default_factory=list)


class RiskAgentOutput(BaseModel):
    risk_flags: List[RiskFlag]
