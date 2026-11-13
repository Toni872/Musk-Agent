"""Session store keyed by session id.

Each session owns one ``MuskAgent``. Without a database the agent lives in memory
(tests, local single-process runs). With a database configured, the agent state is
serialized after every turn so any stateless instance (Vercel) can rehydrate it.
"""

from __future__ import annotations

import json
import threading

from app.agent import LeadContact, MuskAgent
from app.content import APPROVED_CONTENT, ApprovedContent
from app.db import Database
from app.llm import LLMProvider


class SessionStore:
    def __init__(
        self,
        provider: LLMProvider | None,
        database: Database | None = None,
        content: ApprovedContent | None = None,
    ) -> None:
        self._provider = provider
        self._database = database
        self._content = content if content is not None else APPROVED_CONTENT
        self._agents: dict[str, MuskAgent] = {}
        self._lock = threading.Lock()

    @property
    def uses_llm(self) -> bool:
        return self._provider is not None

    def _new_agent(self, lead: LeadContact | None) -> MuskAgent:
        return MuskAgent(content=self._content, provider=self._provider, lead=lead)

    async def _load(self, session_id: str) -> MuskAgent | None:
        if self._database is None:
            with self._lock:
                return self._agents.get(session_id)
        raw = await self._database.load_session_state(session_id)
        if raw is None:
            return None
        agent = self._new_agent(None)
        agent.load_state(json.loads(raw))
        return agent

    async def get_or_create(
        self, session_id: str, lead: LeadContact | None = None
    ) -> MuskAgent:
        agent = await self._load(session_id)
        if agent is not None:
            return agent
        agent = self._new_agent(lead)
        await self.save(session_id, agent)
        return agent

    async def get(self, session_id: str) -> MuskAgent | None:
        return await self._load(session_id)

    async def save(self, session_id: str, agent: MuskAgent) -> None:
        if self._database is None:
            with self._lock:
                self._agents[session_id] = agent
            return
        payload = json.dumps(agent.export_state(), ensure_ascii=False)
        await self._database.save_session_state(session_id, payload)
