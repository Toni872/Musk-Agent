"""Shared Spanish (es-ES) text normalization.

There is exactly ONE normalizer in the codebase. It lives in its own leaf
module (it imports nothing) because both the trigger layer (:mod:`app.rules`)
and the retrieval layer (:mod:`app.retrieval`) need it without an import cycle.

Normalization: lowercase, strip diacritics, replace punctuation with spaces and
collapse whitespace. Trigger patterns are written accent-free so they can be
tested against the folded text.
"""

from __future__ import annotations

import re
import unicodedata

# The exact punctuation set collapsed into spaces by the TypeScript normalizer:
# ¿ ? ¡ ! . , ; : ( ) " ' " " « » [ ]
_PUNCTUATION = re.compile("[¿?¡!.,;:()\"'\u201c\u201d\u00ab\u00bb\\[\\]]")

_WHITESPACE = re.compile(r"\s+")


def normalize_es(text: str) -> str:
    """Fold Spanish input to a comparable form (accent-free, lowercase)."""
    decomposed = unicodedata.normalize("NFD", text)
    without_diacritics = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = without_diacritics.lower()
    spaced = _PUNCTUATION.sub(" ", lowered)
    return _WHITESPACE.sub(" ", spaced).strip()
