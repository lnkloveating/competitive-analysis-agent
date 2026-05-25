"""Compatibility wrapper for the existing LangGraph workflow.

The ResearchAgent implementation lives in app.agents.research_agent.
This module keeps the old import path stable for backend/agents/workflow.py.
"""

from __future__ import annotations

from app.agents.research_agent import research_agent as new_research_agent

from .state import CompetitiveAnalysisState


def research_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_research_agent(state)
