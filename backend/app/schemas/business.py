from typing import Any, Dict, List

from pydantic import BaseModel

from app.schemas.claim import Claim


class BusinessAgentOutput(BaseModel):
    business_matrix: Dict[str, Any]
    claims: List[Claim]
