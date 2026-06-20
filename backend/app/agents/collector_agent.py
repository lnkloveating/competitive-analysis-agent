"""Collector Agent for the product-focused competitive-analysis workflow.

The public DAG exposes one collection role instead of several tiny MCP/status
nodes. Internally this agent performs four structured steps:

1. Resolve user inputs to official product entities.
2. Load stable hardware facts from the local product JSON catalog.
3. Mark official-spec, review-intel, and price data that still need MCP tools.
4. Seed structured evidence for downstream agents.

No network collection happens here. Missing external data is represented as
``pending_data`` so QualityAgent can lower report confidence without pretending the
data was collected.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List

from app.services import product_catalog_service as catalog
from app.services.product_compare_service import build_compare_payload


EXPERIENCE_PENDING_DIMENSIONS = [
    "grip_feel",
    "hand_size_fit",
    "game_type_fit",
    "long_term_reliability",
    "driver_reputation",
    "community_sentiment",
]

OFFICIAL_SPEC_FIELDS = [
    "weight_g",
    "dimensions_mm",
    "shape",
    "shape_detail",
    "sensor",
    "dpi_max",
    "polling_rate_hz",
    "connection",
    "battery_hours",
    "switch_type",
    "click_system",
    "software",
    "onboard_memory",
    "mold_id",
    "official_url",
    "field_confidence",
]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _model(product: Dict[str, Any]) -> str:
    return _as_text(product.get("model") or product.get("id"))


def _append_trace(
    state: dict,
    *,
    status: str,
    input_summary: str,
    output_summary: str,
    started_at: float,
    evidence_added: int = 0,
    pending_fields: List[str] | None = None,
    substeps: List[Dict[str, Any]] | None = None,
) -> None:
    trace_log = state.setdefault("trace_log", [])
    trace_log.append(
        {
            "step_id": len(trace_log) + 1,
            "agent_name": "CollectorAgent",
            "status": status,
            "input_summary": input_summary,
            "output_summary": output_summary,
            "evidence_added": evidence_added,
            "pending_fields": pending_fields or [],
            "substeps": substeps or [],
            "duration_ms": int((time.time() - started_at) * 1000),
            "error": None,
        }
    )


def _pending_entry(agent: str, status: str, fields: List[str], note: str) -> Dict[str, Any]:
    return {
        "agent": agent,
        "status": status,
        "fields": fields,
        "note": note,
    }


def _append_pending(state: dict, entry: Dict[str, Any]) -> List[Dict[str, Any]]:
    pending = [item for item in state.get("pending_data", []) if isinstance(item, dict)]
    key = (entry.get("agent"), entry.get("status"))
    if not any((item.get("agent"), item.get("status")) == key for item in pending):
        pending.append(entry)
    return pending


def _selected_inputs(state: dict) -> List[Any]:
    selected = state.get("selected_products", [])
    if isinstance(selected, list) and selected:
        return selected

    candidates: List[Any] = []
    target = _as_text(state.get("target_platform"))
    if target:
        candidates.append(target)
    for competitor in state.get("competitors", []) or []:
        text = _as_text(competitor)
        if text and text not in candidates:
            candidates.append(text)
    return candidates[:2]


def _input_query(item: Any) -> tuple[str, str | None]:
    if isinstance(item, dict):
        query = _as_text(
            item.get("original_input")
            or item.get("query")
            or item.get("id")
            or item.get("model")
            or item.get("brand")
        )
        preferred_id = _as_text(item.get("id")) or None
        return query, preferred_id
    return _as_text(item), None


def _choose_search_result(category: str, query: str, preferred_id: str | None) -> Dict[str, Any]:
    detail = catalog.search_products_detailed(category, query)
    results = [item for item in detail.get("results", []) if isinstance(item, dict)]
    if preferred_id:
        for result in results:
            if _as_text(result.get("id")) == preferred_id:
                result["disambiguation_reason"] = detail.get("disambiguation_reason")
                return result
    if results:
        results[0]["disambiguation_reason"] = detail.get("disambiguation_reason")
        return results[0]

    product, matched_by, matched_value = catalog.resolve_product(category, query)
    return {
        "id": product.get("id"),
        "brand": product.get("brand"),
        "model": product.get("model"),
        "matched_by": matched_by,
        "matched_value": matched_value,
        "match_confidence": "verified" if matched_by in {"id", "model", "alias"} else matched_by,
        "product": product,
        "disambiguation_reason": None,
    }


def _resolve_products(state: dict, category: str) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    resolved: List[Dict[str, Any]] = []
    full_products: List[Dict[str, Any]] = []
    unresolved: List[str] = []

    for raw_item in _selected_inputs(state):
        query, preferred_id = _input_query(raw_item)
        if not query:
            continue
        try:
            result = _choose_search_result(category, query, preferred_id)
        except Exception:
            unresolved.append(query)
            continue

        product = result.get("product") if isinstance(result.get("product"), dict) else {}
        if not product:
            unresolved.append(query)
            continue

        confidence = _as_text(result.get("match_confidence")) or "unknown"
        matched_by = _as_text(result.get("matched_by"))
        alias_warning = ""
        if matched_by == "community_alias" and confidence != "verified":
            alias_warning = "Community alias is not confirmed as an official product name."

        resolved.append(
            {
                "original_input": query,
                "resolved_product_id": product.get("id"),
                "official_brand": product.get("brand"),
                "official_model": product.get("model"),
                "matched_by": matched_by,
                "matched_value": result.get("matched_value"),
                "match_confidence": confidence,
                "alias_warning": alias_warning,
                "disambiguation_note": result.get("disambiguation_reason"),
                "family": product.get("family"),
                "variant_name": product.get("variant_name"),
                "variant_type": product.get("variant_type"),
                "mold_id": product.get("mold_id"),
                "click_system": product.get("click_system"),
                "product": product,
            }
        )
        full_products.append(product)

    return resolved, full_products, unresolved


def _official_spec_status(product_facts: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[str]]:
    statuses: List[Dict[str, Any]] = []
    for fact in product_facts:
        if not isinstance(fact, dict):
            continue
        specs = fact.get("specs") if isinstance(fact.get("specs"), dict) else {}
        connection = specs.get("connection") if isinstance(specs.get("connection"), list) else []
        missing = []
        for field in OFFICIAL_SPEC_FIELDS:
            if field == "battery_hours" and "2.4ghz" not in connection and "bluetooth" not in connection:
                continue
            if specs.get(field) in (None, "", []):
                missing.append(field)
        statuses.append(
            {
                "product_id": fact.get("product_id"),
                "model": fact.get("model"),
                "status": "pending" if missing else "complete",
                "mcp_required": bool(missing),
                "missing_official_fields": missing,
                "next_action": "future_official_spec_mcp" if missing else "none",
            }
        )

    pending_fields = sorted(
        {field for item in statuses for field in item.get("missing_official_fields", [])}
    )
    return statuses, pending_fields


def _unresolved_official_status(unresolved: List[str]) -> List[Dict[str, Any]]:
    return [
        {
            "input": item,
            "status": "pending",
            "mcp_required": True,
            "missing_official_fields": list(OFFICIAL_SPEC_FIELDS),
            "next_action": "future_search_and_official_spec_mcp",
            "note": "Local product JSON did not match this input; official model and hardware specs must be collected externally.",
        }
        for item in unresolved
    ]


def _review_intel_status() -> Dict[str, Any]:
    return {
        "status": "mcp_not_connected",
        "mcp_required": True,
        "review_dimensions_pending": list(EXPERIENCE_PENDING_DIMENSIONS),
        "contribution_to_final_score": 0,
        "sources_pending": ["bilibili", "youtube", "ecommerce_reviews", "creator_reviews"],
    }


def _price_status() -> Dict[str, Any]:
    return {
        "status": "mcp_not_connected",
        "price_data_required": True,
        "contribution_to_final_score": 0,
        "note": "Prices are time-sensitive and should be collected by realtime MCP tools.",
    }


def _product_schema(category: str) -> Dict[str, Any]:
    return {
        "category": category,
        "stable_local_fields": [
            "brand",
            "model",
            "weight_g",
            "dimensions_mm",
            "shape",
            "sensor",
            "dpi_max",
            "polling_rate_hz",
            "connection",
            "battery_hours",
            "switch_type",
            "click_system",
            "software",
            "onboard_memory",
            "mold_id",
        ],
        "external_pending_fields": [
            "official_spec_updates",
            "user_reviews",
            "creator_reviews",
            "driver_reputation",
            "realtime_price",
            "long_term_reliability",
        ],
    }


def collector_agent(state: dict) -> Dict[str, Any]:
    """Collect and structure inputs for downstream analysis."""
    started = time.time()
    category = _as_text(state.get("industry_key")) or "gaming_mouse"
    inputs = _selected_inputs(state)

    # Empty-input compatibility flow: keep the DAG observable even without product inputs.
    # when no product inputs were supplied.
    if not inputs:
        next_state = {
            **state,
            "current_agent": "CollectorAgent",
            "knowledge_schema": _product_schema(category),
        }
        _append_trace(
            next_state,
            status="skipped",
            input_summary="no product inputs supplied",
            output_summary="collector skipped; legacy research evidence will be used",
            started_at=started,
        )
        return next_state

    resolved, products, unresolved = _resolve_products(state, category)
    if len(products) < 2:
        pending_data = list(state.get("pending_data", []))
        if unresolved:
            pending_data = _append_pending(
                {**state, "pending_data": pending_data},
                _pending_entry(
                    "CollectorAgent.product_resolution",
                    "pending",
                    unresolved,
                    "Local product JSON did not match all inputs; search/official-site MCP should identify official models.",
                ),
            )
            pending_data = _append_pending(
                {**state, "pending_data": pending_data},
                _pending_entry(
                    "CollectorAgent.official_spec",
                    "pending",
                    list(OFFICIAL_SPEC_FIELDS),
                    "Official-site MCP is required before hardware comparison or winner claims.",
                ),
            )
        pending_data = _append_pending(
            {**state, "pending_data": pending_data},
            _pending_entry(
                "CollectorAgent.review_intel",
                "mcp_not_connected",
                list(EXPERIENCE_PENDING_DIMENSIONS),
                "User reviews and creator reviews are not collected yet.",
            ),
        )
        pending_data = _append_pending(
            {**state, "pending_data": pending_data},
            _pending_entry(
                "CollectorAgent.price",
                "mcp_not_connected",
                ["realtime_price", "discounts", "regional_availability"],
                "Realtime price is intentionally not read from local JSON.",
            ),
        )
        next_state = {
            **state,
            "current_agent": "CollectorAgent",
            "product_compare_mode": True,
            "resolved_products": resolved,
            "selected_products": [],
            "unresolved_products": unresolved,
            "product_facts": [],
            "raw_research": [],
            "evidence_list": [],
            "official_spec_status": _unresolved_official_status(unresolved),
            "review_intel_status": _review_intel_status(),
            "price_status": _price_status(),
            "pending_data": pending_data,
            "pending_dimensions": [
                "official_model",
                "hardware_specs",
                *EXPERIENCE_PENDING_DIMENSIONS,
                "realtime_price",
            ],
            "knowledge_schema": _product_schema(category),
            "data_requirements": [
                "search_mcp_pending",
                "official_spec_mcp_pending",
                "review_intel_mcp_pending",
                "price_mcp_pending",
            ],
        }
        _append_trace(
            next_state,
            status="partial",
            input_summary=f"resolved {len(inputs)} product inputs",
            output_summary=(
                f"{len(products)} products resolved, {len(unresolved)} unresolved; "
                "no local evidence seeded, external search/official specs pending"
            ),
            started_at=started,
            evidence_added=0,
            pending_fields=[
                *unresolved,
                "official_model",
                "hardware_specs",
                *EXPERIENCE_PENDING_DIMENSIONS,
                "realtime_price",
            ],
            substeps=[
                {"name": "ProductResolver", "status": "partial", "count": len(resolved)},
                {"name": "ProductFact", "status": "pending", "count": 0},
                {"name": "OfficialSpec", "status": "pending", "pending_fields": list(OFFICIAL_SPEC_FIELDS)},
                {"name": "ReviewIntel", "status": "mcp_not_connected"},
                {"name": "Price", "status": "mcp_not_connected"},
            ],
        )
        return next_state

    payload = build_compare_payload(products[:2], category)
    official_status, official_missing = _official_spec_status(payload["product_facts"])
    pending_data = list(state.get("pending_data", []))
    if official_missing:
        pending_data = _append_pending(
            {**state, "pending_data": pending_data},
            _pending_entry(
                "CollectorAgent.official_spec",
                "pending",
                official_missing,
                "Official-site MCP is not connected in this step.",
            ),
        )
    pending_data = _append_pending(
        {**state, "pending_data": pending_data},
        _pending_entry(
            "CollectorAgent.review_intel",
            "mcp_not_connected",
            list(EXPERIENCE_PENDING_DIMENSIONS),
            "User reviews and creator reviews are not collected yet.",
        ),
    )
    pending_data = _append_pending(
        {**state, "pending_data": pending_data},
        _pending_entry(
            "CollectorAgent.price",
            "mcp_not_connected",
            ["realtime_price", "discounts", "regional_availability"],
            "Realtime price is intentionally not read from local JSON.",
        ),
    )

    next_state = {
        **state,
        "current_agent": "CollectorAgent",
        "product_compare_mode": True,
        "resolved_products": resolved,
        "selected_products": payload["products"],
        "competitors": payload["competitors"],
        "unresolved_products": unresolved,
        "product_facts": payload["product_facts"],
        "raw_research": payload["raw_research"],
        "evidence_list": payload["evidence_list"],
        "focus_dimensions": payload["focus_dimensions"],
        "pending_dimensions": payload.get("pending_dimensions", []),
        "official_spec_status": official_status,
        "review_intel_status": _review_intel_status(),
        "price_status": _price_status(),
        "pending_data": pending_data,
        "knowledge_schema": _product_schema(category),
        "data_requirements": [
            "local_product_json",
            "official_spec_mcp_pending",
            "review_intel_mcp_pending",
            "price_mcp_pending",
        ],
    }
    _append_trace(
        next_state,
        status="success",
        input_summary=f"resolved {len(inputs)} product inputs",
        output_summary=(
            f"resolved {len(products[:2])} products, loaded {len(payload['product_facts'])} "
            f"local fact records, seeded {len(payload['evidence_list'])} evidence items"
        ),
        evidence_added=len(payload["evidence_list"]),
        started_at=started,
        pending_fields=[*unresolved, *official_missing, *EXPERIENCE_PENDING_DIMENSIONS, "realtime_price"],
        substeps=[
            {"name": "ProductResolver", "status": "success", "count": len(resolved)},
            {"name": "ProductFact", "status": "success", "count": len(payload["product_facts"])},
            {
                "name": "OfficialSpec",
                "status": "pending" if official_missing else "complete",
                "pending_fields": official_missing,
            },
            {"name": "ReviewIntel", "status": "mcp_not_connected"},
            {"name": "Price", "status": "mcp_not_connected"},
        ],
    )
    return next_state
