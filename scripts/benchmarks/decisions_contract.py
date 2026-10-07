"""Translate the frozen questions to OpenAI Decisions, without changing criteria."""
import json
import math

MODEL = "gpt-6-luna"
INPUT_RATE = .10
URL = "https://api.openai.com/v1/decisions"


def request(state, contract):
    return {
        "model": MODEL,
        "input": json.dumps(state, ensure_ascii=False),
        "questions": [
            {"type": "choice", "name": name, "instructions": question["instructions"],
             "choices": [{"value": value, "description": description}
                         for value, description in question["criteria"].items()]}
            for name, question in contract.items()
        ],
    }


def answers(result, contract):
    """Refusals, omissions and duplicate names are invalid, never an implicit pass."""
    rows = result.get("answers")
    if not isinstance(rows, list):
        raise ValueError("Invalid Decisions answers")
    indexed = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("name") not in contract:
            raise ValueError("Unexpected Decisions answer")
        name = row["name"]
        if name in indexed:
            raise ValueError("Duplicate Decisions answer")
        indexed[name] = row
    return {name: row.get("choice") if row.get("type") == "choice" else None
            for name in contract for row in [indexed.get(name, {})]}


def cost(usage):
    # Decisions has input-only pricing, including no cache read/write charge.
    tokens = usage.get("input_tokens")
    if isinstance(tokens, bool) or not isinstance(tokens, (int, float)):
        return None
    if not math.isfinite(tokens) or tokens < 0:
        return None
    details = usage.get("input_tokens_details") or {}
    cached = details.get("cached_tokens", 0)
    if isinstance(cached, bool) or not isinstance(cached, (int, float)):
        return None
    if not math.isfinite(cached) or not 0 <= cached <= tokens:
        return None
    return (tokens - cached) * INPUT_RATE / 1_000_000
