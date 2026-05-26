"""Backward compatibility wrapper for the existing workflow.

New implementation lives in app/agents/quality_agent.py.
"""

from __future__ import annotations

from app.agents.quality_agent import quality_agent as new_quality_agent
from app.agents.quality_agent import quality_router as new_quality_router

from .state import CompetitiveAnalysisState


def quality_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_quality_agent(state)


def quality_router(state: CompetitiveAnalysisState) -> str:
    return new_quality_router(state)
