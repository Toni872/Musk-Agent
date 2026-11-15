"""HTTP request/response schemas (pydantic v2)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

LeadBucket = Literal["ilocalizable", "no_comprador"]

# Size caps live in code as named constants (spec S9): a lead message is a
# short chat turn, not a document, and the fields below bound PII blobs.
MAX_SESSION_ID_CHARS = 64
MAX_MESSAGE_CHARS = 1000
MAX_LEAD_ID_CHARS = 64
MAX_CONTACT_CHARS = 40
MAX_LOSS_REASON_CHARS = 240


class LeadIn(BaseModel):
    id: str = Field(max_length=MAX_LEAD_ID_CHARS)
    contact: str = Field(max_length=MAX_CONTACT_CHARS)
    bucket: LeadBucket
    loss_reason: str | None = Field(default=None, max_length=MAX_LOSS_REASON_CHARS)


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=MAX_SESSION_ID_CHARS)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class SessionCreate(BaseModel):
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
    metrics: dict[str, int | float | bool] = Field(default_factory=dict)


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
