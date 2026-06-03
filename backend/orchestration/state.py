from typing import Annotated, TypedDict, List, Dict


def latest_current_agent(left: str, right: str) -> str:
    return right or left


def merge_claims(left: List[Dict], right: List[Dict]) -> List[Dict]:
    merged: List[Dict] = []
    seen: set[str] = set()

    for item in [*(left or []), *(right or [])]:
        if not isinstance(item, dict):
            continue
        claim_id = str(item.get("claim_id") or "")
        key = claim_id or str(id(item))
        if key in seen:
            continue
        merged.append(item)
        seen.add(key)

    return merged


def merge_trace_log(left: List[Dict], right: List[Dict]) -> List[Dict]:
    merged: List[Dict] = []
    seen: set[str] = set()

    for item in [*(left or []), *(right or [])]:
        if not isinstance(item, dict):
            continue
        key = "|".join(
            [
                str(item.get("agent_name") or ""),
                str(item.get("status") or ""),
                str(item.get("output_summary") or ""),
                str(item.get("error") or ""),
            ]
        )
        if key in seen:
            continue
        merged.append(dict(item))
        seen.add(key)

    for step_id, item in enumerate(merged, start=1):
        item["step_id"] = step_id

    return merged


def merge_dict(left: Dict, right: Dict) -> Dict:
    merged: Dict = {}
    if isinstance(left, dict):
        merged.update(left)
    if isinstance(right, dict):
        merged.update(right)
    return merged


class CompetitiveAnalysisState(TypedDict):
    industry_key: str
    industry_name: str
    target_platform: str
    competitors: List[str]
    analysis_scene: str
    target_user: str
    time_range: str
    focus_dimensions: List[str]
    raw_research: List[Dict]
    evidence_list: List[Dict]
    claims: Annotated[List[Dict], merge_claims]
    product_matrix: Dict
    business_matrix: Dict
    risk_flags: List[Dict]
    faithfulness_report: Dict
    unsupported_claim_ids: List[str]
    quality_result: Dict
    final_report: Dict
    context_summary: Annotated[Dict, merge_dict]
    review_ticket: Annotated[Dict, merge_dict]
    used_claim_ids: List[str]
    used_evidence_ids: List[str]
    metrics: Dict
    current_agent: Annotated[str, latest_current_agent]
    iteration_count: int
    rejected_agents: List[str]
    is_approved: bool
    needs_human_review: bool
    quality_status: str
    error_log: List[Dict]
    trace_log: Annotated[List[Dict], merge_trace_log]
