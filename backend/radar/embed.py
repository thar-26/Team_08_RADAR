"""Local multilingual embeddings (Swedish + English), cached in the database."""
from __future__ import annotations

import hashlib
import json
import os

import numpy as np

from . import db
from .config import EMBED_MODEL, MODELS_DIR

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
_model = None


class Unavailable(RuntimeError):
    """The embedding model is not installed (the online demo runs without it)."""


def _get_model():
    global _model
    if _model is None:
        try:
            from fastembed import TextEmbedding
        except ImportError as e:
            raise Unavailable("embedding model not installed") from e
        _model = TextEmbedding(EMBED_MODEL, cache_dir=str(MODELS_DIR))
    return _model


def _norm(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n else v


def vectors(items: dict[str, str]) -> dict[str, np.ndarray]:
    """Embed {key: text}; reuse stored vectors when the text is unchanged."""
    out: dict[str, np.ndarray] = {}
    todo: list[tuple[str, str, str]] = []
    for key, text in items.items():
        h = hashlib.sha1(text.encode()).hexdigest()
        hit = db.one("SELECT text_hash, vector FROM embeddings WHERE key=?", (key,))
        if hit and hit["text_hash"] == h:
            out[key] = np.array(json.loads(hit["vector"]), dtype=np.float32)
        else:
            todo.append((key, text, h))
    if todo:
        vecs = list(_get_model().embed([t[:2000] for _, t, _ in todo], batch_size=32))
        for (key, _, h), v in zip(todo, vecs):
            v = _norm(np.asarray(v, dtype=np.float32))
            out[key] = v
            db.upsert("embeddings", {"key": key, "text_hash": h, "vector": json.dumps([round(float(x), 6) for x in v])}, ["key"])
    return out


def one(text: str) -> np.ndarray:
    return _norm(np.asarray(next(iter(_get_model().embed([text[:2000]]))), dtype=np.float32))
