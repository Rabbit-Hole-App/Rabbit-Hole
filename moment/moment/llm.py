"""Thin LLM wrapper. Swap the body of `complete` for Bedrock/OpenAI/local if needed."""
from __future__ import annotations

import json
import re

import anthropic

from .models import LLM_MODEL

_client = anthropic.Anthropic()


def complete(prompt: str, max_tokens: int = 1024) -> str:
    msg = _client.messages.create(
        model=LLM_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def complete_json(prompt: str, max_tokens: int = 1024) -> dict:
    text = complete(prompt + "\n\nRespond with JSON only, no prose, no code fences.", max_tokens)
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        return json.loads(m.group(0)) if m else {}
