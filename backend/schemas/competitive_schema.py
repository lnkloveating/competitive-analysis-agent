from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class ConsumerElectronicsProductSchema(BaseModel):
    product_name: str
    brand: str
    category: str
    price: Optional[Union[float, str]] = None
    release_date: Optional[str] = None
    specs: Dict[str, Any] = Field(default_factory=dict)
    software_info: Dict[str, Any] = Field(default_factory=dict)
    rating: Optional[float] = None
    review_count: Optional[int] = None
    common_pros: List[str] = Field(default_factory=list)
    common_cons: List[str] = Field(default_factory=list)
    market_share: Optional[Union[float, str]] = None
    growth_trend: Optional[str] = None
    analysis_date: Optional[str] = None
    evidence_ids: List[str] = Field(default_factory=list)
    confidence_score: Optional[float] = None


class CompetitiveProfileSchema(ConsumerElectronicsProductSchema):
    pass
