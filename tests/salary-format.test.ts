import { describe, it, expect } from "bun:test";
import { formatCompactSalaryText, normalizeSalaryText } from "../packages/client/src/lib/job-content";

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

  it("keeps only numeric salary content", () => {
    expect(normalizeSalaryText("$95,000/yr")).toBe("$95,000/yr");
    expect(normalizeSalaryText("Up to $184,000 plus bonus")).toBe("$184,000");
    expect(normalizeSalaryText("Offers Commission")).toBeNull();
  });

  it("removes equity callouts", () => {
    expect(normalizeSalaryText("$148,159–$200,451 • Offers Equity"))
      .toBe("$148,159–$200,451");
    expect(normalizeSalaryText("Offers Equity")).toBeNull();
    expect(normalizeSalaryText("$148,159–$200,451 • Offers Commission"))
      .toBe("$148,159–$200,451");
    expect(normalizeSalaryText("$148,159–$200,451 (Base salary)"))
      .toBe("$148,159–$200,451");
  });

  it("uses compact primary salary bands in feed rows", () => {
    expect(formatCompactSalaryText("$148,159–$200,451 • Offers Equity"))
      .toBe("$148K–$200K");
    expect(formatCompactSalaryText("$165,000–$225,000 · $146,000–$206,000"))
      .toBe("$165K–$225K");
    expect(formatCompactSalaryText("$50–$80/hr")).toBe("$50–$80/hr");
  });

  it("passes through null and empty", () => {
    expect(normalizeSalaryText(null)).toBeNull();
    expect(normalizeSalaryText("  ")).toBeNull();
  });
});
