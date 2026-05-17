"""RAG retrieval for BATD-R manual, used by D_principle_qa free-chat mode."""

import json
import logging
import math
from pathlib import Path

logger = logging.getLogger(__name__)

_KB_PATH = Path(__file__).parent.parent / "data" / "batdr_kb.json"
_kb: list[dict] | None = None


def _load_kb() -> list[dict]:
    global _kb
    if _kb is not None:
        return _kb
    if not _KB_PATH.exists():
        logger.warning("Knowledge base not found at %s — run scripts/build_kb.py", _KB_PATH)
        _kb = []
        return _kb
    with open(_KB_PATH, encoding="utf-8") as f:
        _kb = json.load(f)
    logger.info("Loaded %d chunks from knowledge base", len(_kb))
    return _kb


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def retrieve_manual_context(query: str, n_results: int = 3) -> str:
    """Return relevant BATD-R manual chunks for a query, or '' if unavailable."""
    kb = _load_kb()
    if not kb:
        return ""
    try:
        from app.llm_client import get_embedding
        query_embedding = await get_embedding(query)
        scored = [
            (item["text"], _cosine_similarity(query_embedding, item["embedding"]))
            for item in kb
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        top_chunks = [text for text, _ in scored[:n_results]]
        return "\n\n---\n\n".join(top_chunks)
    except Exception as e:
        logger.warning("RAG retrieval failed: %s", e)
        return ""
