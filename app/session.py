"""In-memory session store keyed by session id.

Each session owns one ``MuskAgent`` instance, so the deterministic state
(stop, handoff, doubts, call counters) survives across requests. Replaced by a
SQLModel-backed store in the persistence phase; the interface stays the same.
"""

from __future__ import annotations

import threading

from app.agent import LeadContact, MuskAgent
from app.content import APPROVED_CONTENT, ApprovedContent
from app.llm import LLMProvider


class SessionStore:
    def __init__(
        self,
        provider: LLMProvider | None,
        content: ApprovedContent | None = None,
    ) -> None:
        self._provider = provider
        self._content = content if content is not None else APPROVED_CONTENT
        self._agents: dict[str, MuskAgent] = {}
        self._lock = threading.Lock()

    @property
    def uses_llm(self) -> bool:
        return self._provider is not None

    def get_or_create(self, session_id: str, lead: LeadContact | None = None) -> MuskAgent:
        with self._lock:
            agent = self._agents.get(session_id)
            if agent is None:
                agent = MuskAgent(
                    content=self._content,
                    provider=self._provider,
                    lead=lead,
                )
                self._agents[session_id] = agent
            return agent

    def get(self, session_id: str) -> MuskAgent | None:
        with self._lock:
            return self._agents.get(session_id)
