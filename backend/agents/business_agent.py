"""Backward compatibility wrapper for the existing workflow.

New implementation lives in app/agents/business_agent.py.
"""

from __future__ import annotations

from app.agents.business_agent import business_agent as new_business_agent

from .state import CompetitiveAnalysisState


def business_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_business_agent(state)
