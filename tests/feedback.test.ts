import { describe, expect, test } from "bun:test";
import { validateFeedbackInput } from "../worker/feedback";

describe("feedback validation", () => {
  test("normalizes a company request", () => {
    expect(validateFeedbackInput({
      submission_type: "company_request",
      title: "  Acme Labs  ",
      details: "  Their jobs live here.  ",
      careers_url: "https://example.com/careers",
    })).toEqual({
      ok: true,
      value: {
        submission_type: "company_request",
        title: "Acme Labs",
        details: "Their jobs live here.",
        careers_url: "https://example.com/careers",
      },
    });
  });

  test("accepts product feedback without a URL", () => {
    expect(validateFeedbackInput({
      submission_type: "feature_request",
      title: "Add weekly digests",
    })).toEqual({
      ok: true,
      value: {
        submission_type: "feature_request",
        title: "Add weekly digests",
        details: "",
        careers_url: null,
      },
    });
  });

  test("rejects invalid types and URLs", () => {
    expect(validateFeedbackInput({
      submission_type: "bug",
      title: "Something broke",
    })).toEqual({ ok: false, error: "Choose a valid feedback type" });

    expect(validateFeedbackInput({
      submission_type: "company_request",
      title: "Acme Labs",
      careers_url: "javascript:alert(1)",
    })).toEqual({ ok: false, error: "Careers URL must start with http:// or https://" });
  });

  test("enforces content limits", () => {
    expect(validateFeedbackInput({
      submission_type: "general_feedback",
      title: "x",
    })).toEqual({ ok: false, error: "Title must be between 2 and 160 characters" });

    expect(validateFeedbackInput({
      submission_type: "general_feedback",
      title: "A useful note",
      details: "x".repeat(2001),
    })).toEqual({ ok: false, error: "Details must be 2,000 characters or fewer" });
  });
});

