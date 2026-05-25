"""Backward compatibility wrapper for the existing workflow.

New implementation lives in app/agents/research_agent.py.
"""

from __future__ import annotations

from app.agents.research_agent import research_agent as new_research_agent

from .state import CompetitiveAnalysisState


def research_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_research_agent(state)
