from pydantic import BaseModel


class ReportMetrics(BaseModel):
    evidence_count: int
    claim_count: int
    citation_rate: float
    coverage_rate: float
    high_credibility_ratio: float
    low_credibility_ratio: float
    quality_score: float
    iteration_count: int
