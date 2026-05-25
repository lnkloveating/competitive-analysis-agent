"""Backward compatibility wrapper for the existing workflow.

New EvidenceAgent implementation lives in app/agents/evidence_agent.py.
"""

from __future__ import annotations

from app.agents.evidence_agent import evidence_agent as new_evidence_agent

from .state import CompetitiveAnalysisState


def evidence_agent(state: CompetitiveAnalysisState) -> CompetitiveAnalysisState:
    return new_evidence_agent(state)
