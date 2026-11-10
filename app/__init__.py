"""MUSK MVP conversational agent (Python rewrite).

The package layout mirrors the safety-first split of the TypeScript harness:

- ``text``        — the single Spanish normalizer (leaf module, imports nothing)
- ``rules``       — the 11 hard rules, input triggers and the output guard
- ``content``     — approved lead-facing copy (unified, pending MUSK signature)
- ``kb``          — the curated knowledge base passages
- ``retrieval``   — deterministic BM25 retrieval with forbidden-topic gate
- ``llm``         — OpenAI-compatible HTTP client and a deterministic mock
- ``agent``       — the RAG orchestration (turn loop, fallback, handoff)
"""

__version__ = "0.1.0"
