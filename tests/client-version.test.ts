import { describe, expect, test } from "bun:test";
import {
  clientApiVersion,
  supportsStructuredApi,
} from "../worker/client-version";

describe("client API compatibility", () => {
  test("treats installed clients without a version header as schema v1", () => {
    const request = new Request("https://pinkslip.test/api/profile");
    expect(clientApiVersion(request)).toBe(1);
    expect(supportsStructuredApi(request)).toBe(false);
  });

  test("recognizes the structured schema advertised by current clients", () => {
    const request = new Request("https://pinkslip.test/api/profile", {
      headers: { "X-Pinkslip-Api-Version": "2" },
    });
    expect(clientApiVersion(request)).toBe(2);
    expect(supportsStructuredApi(request)).toBe(true);
  });

  test("does not trust malformed or unsupported version values", () => {
    const malformed = new Request("https://pinkslip.test/api/profile", {
      headers: { "X-Pinkslip-Api-Version": "not-a-version" },
    });
    expect(clientApiVersion(malformed)).toBe(1);
    expect(supportsStructuredApi(malformed)).toBe(false);
  });
});
