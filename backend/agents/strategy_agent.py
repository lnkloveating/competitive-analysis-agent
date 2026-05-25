"""Backward compatibility wrapper for the existing workflow.

New implementation lives in app/agents/strategy_agent.py.
"""

from __future__ import annotations

from app.agents.strategy_agent import strategy_agent as new_strategy_agent

from .state import CompetitiveAnalysisState


def strategy_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_strategy_agent(state)
