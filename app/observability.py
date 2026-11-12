"""Structured logging via structlog.

Configured once at import: JSON output with ISO timestamps, filtered at
WARNING by default so the deterministic test suite stays quiet. Turn-level
events are logged at INFO and surface only counts/actions, never the lead's
message content.
"""

from __future__ import annotations

import logging

import structlog


def configure_logging(level: str = "WARNING") -> None:
    numeric_level = getattr(logging, level.upper(), logging.WARNING)
    if not isinstance(numeric_level, int):
        numeric_level = logging.WARNING
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
    )


configure_logging()

logger = structlog.get_logger()
