"""Vercel ASGI entrypoint.

Vercel's Python runtime imports a top-level ``app`` from a supported filename;
this module re-exports the FastAPI application defined in ``app/main.py``.
"""

from app.main import app

__all__ = ["app"]
