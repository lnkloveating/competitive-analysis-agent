from pydantic import BaseModel
from typing import Optional, List, Literal

class MembershipSchema(BaseModel):
    tiers: List[str]
    monthly_price_cny: Optional[float]
    annual_price_cny: Optional[float]
    free_tier_available: bool
    family_plan: bool
    student_discount: bool

class ContentSchema(BaseModel):
    original_content: bool
    licensed_content: bool
    content_categories: List[str]
    international_content: bool
    content_update_frequency: str

class TechCapabilitySchema(BaseModel):
    recommendation_system: Literal["basic", "advanced", "ai_powered"]
    max_resolution: str
    offline_download: bool
    multi_device: bool
    max_concurrent_streams: int

class CompetitiveProfileSchema(BaseModel):
    platform_name: str
    platform_type: Literal["domestic", "international"]
    membership: MembershipSchema
    content: ContentSchema
    tech_capability: TechCapabilitySchema
    strengths: List[str]
    weaknesses: List[str]
    opportunities: List[str]
    threats: List[str]
    analysis_date: str
    evidence_ids: List[str]
    confidence_score: float
