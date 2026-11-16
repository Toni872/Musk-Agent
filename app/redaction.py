"""Redaction of direct personal data before it leaves for the LLM provider.

The only place a lead's own words reach the model is the history sent with each
completion (``app/agent.MuskAgent._build_history_messages``). That copy is
redacted here; the stored history, the retrieval and the deterministic replies
keep the original text, so nothing useful is lost on our side.

What is redacted, and only this, until MUSK decides more:

- email addresses,
- phone numbers (9+ digits, with an optional +country prefix),
- Spanish identity documents (DNI/NIE).

Names are deliberately left alone for now: masking them reliably would degrade
the conversation (the model uses the lead's name naturally), and it is an open
decision. Arbitrary long numbers are also left alone on purpose: a lead saying
"2 anos de experiencia" must not become "[redacted] anos de experiencia".

This is a leaf module with no imports from the rest of the app, like
``app.text``. It is deterministic and needs no configuration: redaction is
always on at the LLM boundary. The stored data remains raw and is governed by
``app.retention``.
"""

from __future__ import annotations

import re

# Category placeholders. They keep the sentence shape ("mi telefono es X") while
# hiding the value, so the model still understands what the lead shared without
# seeing it.
_REDACT_EMAIL = "[email]"
_REDACT_PHONE = "[telefono]"
_REDACT_DOCUMENT = "[documento]"

# Local part + domain + TLD. Covers the common forms (dots, plus-tags, subdomains).
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter). Word boundaries
# on both sides keep it from matching inside longer alphanumeric runs.
_DOCUMENT_RE = re.compile(r"(?<![A-Za-z0-9])(?:\d{8}|[XYZxyz]\d{7})[A-Za-z](?![A-Za-z0-9])")

# 9 or more digits with optional separators (space, dot, dash) and an optional
# +country prefix. The 9-digit floor is what keeps "2 anos" or a year like
# "2026" untouched; the lookbehind keeps it out of emails and other tokens.
_PHONE_RE = re.compile(r"(?<![A-Za-z0-9])(?:\+\d{1,3}[\s.-]?)?\d(?:[\s.-]?\d){8,}")


def redact(text: str) -> str:
    """Return ``text`` with direct personal data replaced by placeholders."""
    redacted = _EMAIL_RE.sub(_REDACT_EMAIL, text)
    redacted = _DOCUMENT_RE.sub(_REDACT_DOCUMENT, redacted)
    redacted = _PHONE_RE.sub(_REDACT_PHONE, redacted)
    return redacted
