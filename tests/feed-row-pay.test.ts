import { describe, expect, test } from "bun:test";
import { rowFacts, rowTopPay } from "../apps/native/src/features/redesign/job-facts";

type Job = Parameters<typeof rowFacts>[0];
const job = (fields: Partial<Job>) => ({ title: "Software Engineer", location: "New York, NY", salary: "$150,000 - $180,000", ...fields }) as Job;

describe("the row sorted by pay", () => {
  test("the top of the range goes in the trailing slot", () => {
    expect(rowTopPay(job({}))).toBe("$180K");
    expect(rowTopPay(job({ salary: "$200,000" }))).toBe("$200K");
  });

  test("hourly pay and no pay have nothing to show there", () => {
    expect(rowTopPay(job({ salary: "$55/hr" }))).toBeUndefined();
    expect(rowTopPay(job({ salary: null }))).toBeUndefined();
  });

  test("the range doesn't repeat on line two", () => {
    expect(rowFacts(job({}), undefined, { ageNotPay: true })).not.toContain("180");
  });
});

describe("the row with one place picked", () => {
  test("a job in only that place leaves it out", () => {
    expect(rowFacts(job({}), undefined, { onlyPlace: true })).not.toContain("New York");
  });

  test("the pay stays", () => {
    expect(rowFacts(job({}), undefined, { onlyPlace: true })).toContain("$150–180K");
  });
});
