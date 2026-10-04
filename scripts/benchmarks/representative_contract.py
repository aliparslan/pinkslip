"""Frozen extraction contract; reference labels never enter model requests."""
import json
from pathlib import Path

def questions(schema: Path | None = None):
    return json.loads((schema or Path(__file__).with_name("representative-questions.json")).read_text())
