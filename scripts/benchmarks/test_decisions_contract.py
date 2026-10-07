"""Offline protocol and paid-call guard checks; no provider calls."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import decisions_contract as decisions
import run_representative as runner

CONTRACT = {"us_eligibility": {"type": "choice", "instructions": "Respect hiring restrictions.",
                             "criteria": {"yes": "US permitted", "unclear": "Missing evidence"}}}


class DecisionsTests(unittest.TestCase):
    def test_exact_translation_and_no_labels(self):
        state = {"title": "Engineer", "location": "Remote", "department": None,
                 "description": "Full posting text."}
        body = decisions.request(state, CONTRACT)
        self.assertEqual(json.loads(body["input"]), state)
        self.assertEqual(body["questions"], [{"type": "choice", "name": "us_eligibility",
            "instructions": "Respect hiring restrictions.", "choices": [
                {"value": "yes", "description": "US permitted"},
                {"value": "unclear", "description": "Missing evidence"}]}])
        self.assertEqual(set(body), {"model", "input", "questions"})

    def test_refusal_and_missing_answer_remain_invalid(self):
        for rows in [[], [{"name": "us_eligibility", "type": "refusal"}]]:
            self.assertIsNone(decisions.answers({"answers": rows}, CONTRACT)["us_eligibility"])

    def test_duplicate_and_unknown_names_rejected(self):
        answer = {"name": "us_eligibility", "type": "choice", "choice": "yes"}
        for rows in [[answer, answer], [{**answer, "name": "unknown"}]]:
            with self.assertRaises(ValueError):
                decisions.answers({"answers": rows}, CONTRACT)

    def test_input_only_billing_and_unknown_usage(self):
        self.assertAlmostEqual(decisions.cost({"input_tokens": 1000, "output_tokens": 9000}), .0001)
        self.assertAlmostEqual(decisions.cost({"input_tokens": 1000,
            "input_tokens_details": {"cached_tokens": 400, "cache_write_tokens": 200}}), .00006)
        for usage in [{}, {"input_tokens": True}, {"input_tokens": -1},
                      {"input_tokens": float("nan")},
                      {"input_tokens": 10, "input_tokens_details": {"cached_tokens": 11}}]:
            self.assertIsNone(decisions.cost(usage))

    def run_benchmark(self, root, response):
        argv = ["run", "--root", str(root), "--provider", "decisions", "--budget", "0.5"]
        with patch.object(sys, "argv", argv), patch.object(runner, "questions", return_value=CONTRACT), \
             patch.dict(os.environ, {"OPENAI_API_KEY": "offline-test-only"}), \
             patch.object(runner.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(response).encode())) as call, \
             contextlib.redirect_stdout(io.StringIO()):
            runner.main()
        return call

    def test_pilot_refusal_stops_bulk(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dataset.json").write_text(json.dumps([
                {"id": str(i), "title": "Engineer", "description_text": "Public text"} for i in range(3)]))
            call = self.run_benchmark(root, {"model": decisions.MODEL,
                "answers": [{"name": "us_eligibility", "type": "refusal"}],
                "usage": {"input_tokens": 100}})
            self.assertEqual(call.call_count, 1)
            summary = json.loads((root / "decisions-run.json").read_text())
            self.assertTrue(summary["stopped_early"])
            self.assertEqual(summary["invalid_outputs"], 1)

    def test_success_is_cached_without_another_paid_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dataset.json").write_text(json.dumps([
                {"id": "1", "title": "Engineer", "description_text": "Public text"}]))
            response = {"model": decisions.MODEL, "usage": {"input_tokens": 100},
                "answers": [{"name": "us_eligibility", "type": "choice", "choice": "yes"}]}
            first = self.run_benchmark(root, response)
            self.assertEqual(first.call_args.args[0].full_url, decisions.URL)
            second = self.run_benchmark(root, response)
            self.assertEqual(second.call_count, 0)
            summary = json.loads((root / "decisions-run.json").read_text())
            self.assertEqual(summary["completed"], 1)
            self.assertEqual(summary["new_reported_gross_cost_usd"], 0)


if __name__ == "__main__":
    unittest.main()
