"""Groq LLM access with caching, strict JSON-schema output, retries on rate
limits, and a prompt-injection detector."""
from __future__ import annotations

import hashlib
import json
import re
import time
from typing import Type, TypeVar

from groq import APIStatusError, BadRequestError, Groq, RateLimitError
from pydantic import BaseModel, ValidationError

from . import db
from .config import GROQ_API_KEY, MODEL_PROMPT_GUARD, MODEL_REASONING, now_iso

T = TypeVar("T", bound=BaseModel)

_client: Groq | None = None


def client() -> Groq:
    global _client
    if _client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is missing. Put it in radar/.env")
        _client = Groq(api_key=GROQ_API_KEY, max_retries=0)
    return _client


def _strictify(schema: dict) -> dict:
    """Make a pydantic JSON schema acceptable for strict structured output:
    every object lists all properties as required and forbids extras."""
    defs = schema.pop("$defs", {})

    def walk(node):
        """`node` is always a schema object (never a `properties` mapping)."""
        if isinstance(node, list):
            return [walk(v) for v in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            ref = node["$ref"].split("/")[-1]
            return walk(json.loads(json.dumps(defs[ref])))
        out = {k: v for k, v in node.items() if k not in ("title", "default")}
        if "properties" in out:
            out["properties"] = {name: walk(sub) for name, sub in out["properties"].items()}
            out["required"] = list(out["properties"].keys())
            out["additionalProperties"] = False
        for key in ("items", "anyOf", "allOf", "oneOf"):
            if key in out:
                out[key] = walk(out[key])
        return out

    return walk(schema)


def _call(**kwargs):
    delay = 4.0
    for attempt in range(6):
        try:
            return client().chat.completions.create(**kwargs)
        except RateLimitError as e:
            retry_after = None
            try:
                retry_after = float(e.response.headers.get("retry-after", "0"))
            except (TypeError, ValueError):
                pass
            m = re.search(r"try again in ([\d.]+)s", str(e))
            wait = max(retry_after or 0, float(m.group(1)) if m else 0, delay)
            time.sleep(min(wait + 0.5, 90))
            delay *= 1.7
        except BadRequestError:
            raise
        except APIStatusError as e:
            if e.status_code >= 500 and attempt < 3:
                time.sleep(delay)
                continue
            raise
    raise RuntimeError("LLM rate limit: gave up after retries")


def structured(
    schema: Type[T],
    system: str,
    user: str,
    *,
    model: str = MODEL_REASONING,
    use_cache: bool = True,
    reasoning_effort: str = "medium",
    temperature: float = 0.2,
) -> T:
    """Ask the model for an object matching `schema`. Cached by input hash."""
    json_schema = _strictify(schema.model_json_schema())
    key = hashlib.sha256(
        json.dumps([model, system, user, json_schema, reasoning_effort], ensure_ascii=False).encode()
    ).hexdigest()
    if use_cache:
        hit = db.one("SELECT response FROM llm_cache WHERE key=?", (key,))
        if hit:
            try:
                return schema.model_validate_json(hit["response"])
            except ValidationError:
                pass
    last_err: Exception | None = None
    # Attempt 1-2: strict structured output. Attempt 3-4: JSON mode with the schema
    # in the prompt, validated by pydantic (more tolerant for large schemas).
    for attempt in range(4):
        strict = attempt < 2
        sys_msg = system if strict else (
            system + "\n\nReturn ONLY a JSON object that validates against this JSON schema:\n" + json.dumps(json_schema)
        )
        try:
            resp = _call(
                model=model,
                messages=[{"role": "system", "content": sys_msg}, {"role": "user", "content": user}],
                response_format=(
                    {"type": "json_schema", "json_schema": {"name": schema.__name__, "strict": True, "schema": json_schema}}
                    if strict else {"type": "json_object"}
                ),
                temperature=temperature if attempt == 0 else 0.0,
                reasoning_effort=reasoning_effort,
                max_completion_tokens=12000,
            )
        except BadRequestError as e:  # json_validate_failed etc.
            last_err = e
            continue
        content = resp.choices[0].message.content or ""
        try:
            obj = schema.model_validate_json(content)
            db.upsert("llm_cache", {"key": key, "response": content, "created_at": now_iso()}, ["key"])
            return obj
        except ValidationError as e:
            last_err = e
    raise RuntimeError(f"Model output did not match schema: {str(last_err)[:500]}")


def injection_score(text: str) -> float:
    """Probability (0-1) that `text` contains a prompt-injection / jailbreak.
    Long texts are checked in windows; the maximum is returned."""
    text = (text or "").strip()
    if not text:
        return 0.0
    # The guard model has a 512-token context: check overlapping ~900-char windows.
    windows = [text[i : i + 900] for i in range(0, min(len(text), 9000), 800)]
    best = 0.0
    for w in windows:
        key = "pg:" + hashlib.sha256(w.encode()).hexdigest()
        hit = db.one("SELECT response FROM llm_cache WHERE key=?", (key,))
        if hit:
            score = float(hit["response"])
        else:
            resp = _call(model=MODEL_PROMPT_GUARD, messages=[{"role": "user", "content": w}])
            try:
                score = float((resp.choices[0].message.content or "0").strip())
            except ValueError:
                score = 0.0
            db.upsert("llm_cache", {"key": key, "response": str(score), "created_at": now_iso()}, ["key"])
        best = max(best, score)
    return best
