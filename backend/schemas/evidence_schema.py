from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class EvidenceSchema(BaseModel):
    evidence_id: str
    platform: str
    claim: str
    source_type: Literal["official", "news", "review", "report", "user_survey"]
    source_title: str
    source_url: str
    publish_time: Optional[str] = None
    collected_time: str = datetime.now().isoformat()
    credibility: Literal["high", "medium", "low"]
    related_dimension: str
    used_by_agent: str
    raw_content: Optional[str] = None
