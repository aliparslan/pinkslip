import { describe, expect, it } from "bun:test";
import type { PreparedApplication, PreparedApplicationField } from "@pinkslip/core/api";
import { autofillPayload, autofillScript } from "../src/lib/application-autofill";

function field(overrides: Partial<PreparedApplicationField>): PreparedApplicationField {
  return {
    id: "f",
    label: "Field",
    type: "text",
    required: false,
    options: [],
    section: "questions",
    key: "q:field",
    answer: null,
    source: null,
    ...overrides,
  };
}

const prepared: PreparedApplication = {
  job_id: "job-1",
  supported: true,
  ats: "greenhouse",
  apply_url: "https://job-boards.greenhouse.io/acme/jobs/1",
  missing_required: 1,
  fields: [
    field({ id: "first_name", key: "first_name", answer: "Ali", source: "resume" }),
    field({ id: "question_1", type: "select", answer: "Yes", source: "saved" }),
    field({ id: "question_2", type: "textarea", answer: null, required: true }),
    field({ id: "resume", type: "file", key: "resume", answer: "Your resume", source: "resume" }),
    field({ id: "cover_letter", type: "file", key: "cover_letter" }),
  ],
};

describe("autofill payload", () => {
  it("carries answered fields and attaches the resume only when one is saved", () => {
    const resume = { name: "resume.pdf", base64: "JVBERi0=" };
    expect(autofillPayload(prepared, resume)).toEqual({
      ats: "greenhouse",
      resume,
      fields: [
        { id: "first_name", type: "text", answer: "Ali" },
        { id: "question_1", type: "select", answer: "Yes" },
        { id: "resume", type: "file", answer: "resume.pdf" },
      ],
    });
    expect(autofillPayload(prepared, null)?.fields.map((item) => item.id)).toEqual(["first_name", "question_1"]);
  });

  it("has nothing to fill for an unsupported form", () => {
    expect(autofillPayload({ ...prepared, supported: false, ats: null }, null)).toBeNull();
  });
});

describe("autofill script", () => {
  it("is one self-contained expression with the payload inlined", () => {
    const payload = autofillPayload(prepared, null)!;
    const script = autofillScript(payload);
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain(JSON.stringify(payload));
    expect(script.startsWith("(")).toBe(true);
  });

  it("can't be broken out of by an answer's text", () => {
    const script = autofillScript({
      ats: "ashby",
      resume: null,
      fields: [{ id: "x", type: "text", answer: "\"});alert(1);//</script>" }],
    });
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toContain("});alert(1);//\"");
  });
});
