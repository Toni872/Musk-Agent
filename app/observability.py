"""Structured logging via structlog.

Configured once at import: JSON output with ISO timestamps, filtered at
WARNING by default so the deterministic test suite stays quiet. Turn-level
events are logged at INFO and surface only counts/actions, never the lead's
message content.
"""

from __future__ import annotations

import logging

import structlog


def configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING),
    )


configure_logging()

logger = structlog.get_logger()
