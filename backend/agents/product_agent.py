"""Backward compatibility wrapper for the existing workflow.

New ProductAgent implementation lives in app/agents/product_agent.py.
"""

from __future__ import annotations

from app.agents.product_agent import product_agent as new_product_agent

from .state import CompetitiveAnalysisState


def product_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_product_agent(state)
