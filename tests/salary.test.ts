import { describe, expect, it } from "vitest";
import { extractSalaryFromHtml, formatGreenhouseSalary, formatLeverSalary } from "@worker/adapters/salary";

describe("salary helpers", () => {
  it("extracts plain-text compensation ranges from ATS HTML", () => {
    const html = `
      <p>The estimated pay ranges for this role are as follows:</p>
      <ul>
        <li><span class="collapsed-field-text">CAD $132,640.00 - CAD $165,800.00</span></li>
      </ul>
      <p>Target Bonus Percentage is 12.5%</p>
    `;

    expect(extractSalaryFromHtml(html)).toBe("CAD $132,640.00 - CAD $165,800.00");
  });

  it("formats greenhouse structured ranges", () => {
    expect(
      formatGreenhouseSalary({
        min_cents: 15000000,
        max_cents: 21000000,
        currency_type: "USD",
        title: "Base salary",
      })
    ).toBe("$150,000 – $210,000 (Base salary)");
  });

  it("formats lever structured ranges", () => {
    expect(
      formatLeverSalary({
        min: 170000,
        max: 215000,
        currency: "USD",
        interval: "year",
      })
    ).toBe("$170,000 – $215,000/year");
  });
});
