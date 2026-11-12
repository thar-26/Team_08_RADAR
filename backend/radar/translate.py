"""Translation layer for the Swedish/English interface.

Agent output is stored once (in English); the API localises it on the way out.
Every translated string is cached in the database, so each text is translated
only once and later page loads are instant."""
from __future__ import annotations

import hashlib
import json

from pydantic import BaseModel

from . import db, llm
from .config import MODEL_REASONING, now_iso

LANG_NAME = {"sv": "Swedish (svenska)", "en": "English"}

SYSTEM = """You translate short texts for a Swedish innovation service used by companies in Blekinge.
Translate every item into natural, professional {lang} as a Swedish business reader would expect.
- Keep company names, product names, programme and call names, acronyms, URLs, numbers and dates unchanged.
- Keep the meaning exact. Do not add, remove or soften information (keep words like "possible", "inferred", "uncertain").
- If an item is already in {lang}, return it unchanged.
- Return exactly one output per input id."""


class _Item(BaseModel):
    id: int
    text: str


class _Batch(BaseModel):
    items: list[_Item]


_EN_WORDS = {"the", "and", "with", "for", "its", "which", "that", "this", "could", "may", "has", "are", "is", "of", "to"}
_SV_WORDS = {"och", "att", "för", "med", "som", "är", "det", "en", "ett", "kan", "har", "på", "till", "av", "de"}


def _wrong_language(text: str, lang: str) -> bool:
    """True when a 'translation' still reads as the other language (the model
    sometimes returns the input unchanged)."""
    words = [w.strip(".,;:()\"'").lower() for w in text.split()]
    if len(words) < 6:
        return False
    en = sum(w in _EN_WORDS for w in words)
    sv = sum(w in _SV_WORDS for w in words)
    return en > sv if lang == "sv" else sv > en


def _key(text: str, lang: str) -> str:
    return f"tr:{lang}:" + hashlib.sha256(text.encode()).hexdigest()


def translate(texts: list[str], lang: str) -> list[str]:
    """Translate a list of strings; returns the same length/order. Empty strings pass through."""
    if lang not in LANG_NAME:
        return texts
    out = list(texts)
    todo: dict[str, list[int]] = {}
    for i, t in enumerate(texts):
        if not t or not t.strip():
            continue
        hit = db.one("SELECT response FROM llm_cache WHERE key=?", (_key(t, lang),))
        if hit and not _wrong_language(hit["response"], lang):
            out[i] = hit["response"]
        else:
            todo.setdefault(t, []).append(i)
    pending = list(todo)
    # The model occasionally skips an item in a batch: retry what is missing,
    # in smaller batches, before falling back to the original text.
    for size in (30, 8, 1):
        missed: list[str] = []
        for start in range(0, len(pending), size):
            chunk = pending[start : start + size]
            payload = json.dumps([{"id": j, "text": t} for j, t in enumerate(chunk)], ensure_ascii=False)
            try:
                res = llm.structured(
                    _Batch, SYSTEM.format(lang=LANG_NAME[lang]), payload,
                    model=MODEL_REASONING, reasoning_effort="low", temperature=0.0, use_cache=False,
                )
                by_id = {it.id: it.text for it in res.items}
            except RuntimeError:
                by_id = {}
            for j, src in enumerate(chunk):
                tr = by_id.get(j)
                # Still in the source language? Retry in a smaller batch (single items are accepted).
                if not tr or not tr.strip() or (_wrong_language(tr, lang) and size > 1):
                    missed.append(src)
                    continue
                db.upsert("llm_cache", {"key": _key(src, lang), "response": tr, "created_at": now_iso()}, ["key"])
                for i in todo[src]:
                    out[i] = tr
        pending = missed
        if not pending:
            break
    return out


class Collector:
    """Collect strings from nested objects, translate in one batch, write back."""

    def __init__(self, lang: str):
        self.lang = lang
        self.slots: list[tuple[object, object]] = []

    def add(self, container, key) -> None:
        value = container[key] if isinstance(container, (dict, list)) else None
        if isinstance(value, str) and value.strip():
            self.slots.append((container, key))

    def add_list(self, container, key) -> None:
        lst = container.get(key) if isinstance(container, dict) else None
        if isinstance(lst, list):
            for i in range(len(lst)):
                self.add(lst, i)

    def run(self) -> None:
        if self.lang == "en" or not self.slots:
            return
        texts = [c[k] for c, k in self.slots]
        for (c, k), t in zip(self.slots, translate(texts, self.lang)):
            c[k] = t
