"""HTTP request/response schemas (pydantic v2)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

LeadBucket = Literal["ilocalizable", "no_comprador"]


class LeadIn(BaseModel):
    id: str
    contact: str
    bucket: LeadBucket
    loss_reason: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str
    lead: LeadIn | None = None


class SessionCreate(BaseModel):
    session_id: str
    lead: LeadIn | None = None


class HandoffOut(BaseModel):
    reason: str
    lead_id: str
    contact: str
    bucket: str
    recipient: str | None = None
    last_message: str
    summary: str
    formation: str
    doubts: list[str]
    loss_reason: str | None = None
    after_handoff: list[str] | None = None


class TurnOut(BaseModel):
    intent: str
    action: str
    reply: str
    suppressed: bool
    registered_doubts: list[str]
    registered_no_continuar: bool
    rule_violations: list[str]
    handoff: HandoffOut | None = None


class RecordOut(BaseModel):
    kind: str
    detail: str
    timestamp: str
    intent: str | None = None


class QualificationOut(BaseModel):
    question_id: str
    answer: str


class SessionStateOut(BaseModel):
    session_id: str
    banner: str
    opening: str | None
    stopped: bool
    turn_count: int
    records: list[RecordOut]
    doubts: list[str]
    pending_decisions: list[str]
    qualification_answers: list[QualificationOut]
    handoff: HandoffOut | None = None
    metrics: dict[str, int] = Field(default_factory=dict)


class ReportMessage(BaseModel):
    role: str
    text: str


class ReportRecord(BaseModel):
    timestamp: str | None = None
    kind: str
    intent: str | None = None
    detail: str


class ReportQualification(BaseModel):
    question_id: str
    answer: str


class ReportPayload(BaseModel):
    generated_at: str
    turn_count: int
    stopped: bool
    messages: list[ReportMessage] = Field(default_factory=list)
    records: list[ReportRecord] = Field(default_factory=list)
    doubts: list[str] = Field(default_factory=list)
    handoff: HandoffOut | None = None
    qualification_answers: list[ReportQualification] = Field(default_factory=list)
