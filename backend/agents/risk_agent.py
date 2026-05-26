"""Backward compatibility wrapper for the existing workflow.

New implementation lives in app/agents/risk_agent.py.
"""

from __future__ import annotations

from app.agents.risk_agent import risk_agent as new_risk_agent

from .state import CompetitiveAnalysisState


def risk_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_risk_agent(state)
