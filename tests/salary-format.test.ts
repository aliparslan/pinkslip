import { describe, it, expect } from "bun:test";
import { normalizeSalaryText } from "../frontend/src/lib/job-content";

describe("normalizeSalaryText", () => {
  it("normalizes spaced hyphens to a bare en dash", () => {
    expect(normalizeSalaryText("$162,000 - $260,000")).toBe("$162,000–$260,000");
  });

  it("normalizes spaced en dashes", () => {
    expect(normalizeSalaryText("$114,000 – $184,000")).toBe("$114,000–$184,000");
  });

  it("normalizes em dashes and 'to'", () => {
    expect(normalizeSalaryText("$120,000—$150,000")).toBe("$120,000–$150,000");
    expect(normalizeSalaryText("120K to 150K")).toBe("120K–150K");
  });

  it("collapses whitespace and currency gaps", () => {
    expect(normalizeSalaryText("$ 114,000  -  $ 184,000")).toBe("$114,000–$184,000");
  });

  it("leaves non-range text alone", () => {
    expect(normalizeSalaryText("$95,000/yr")).toBe("$95,000/yr");
    expect(normalizeSalaryText("Up to $184,000")).toBe("Up to $184,000");
  });

  it("passes through null and empty", () => {
    expect(normalizeSalaryText(null)).toBeNull();
    expect(normalizeSalaryText("  ")).toBeNull();
  });
});
