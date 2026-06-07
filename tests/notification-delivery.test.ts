import { describe, expect, test } from "bun:test";
import { failureStatusAfterAttempt } from "@worker/notification-delivery";

describe("notification delivery retries", () => {
  test("retries the first two failed attempts", () => {
    expect(failureStatusAfterAttempt(0)).toBe("retry");
    expect(failureStatusAfterAttempt(1)).toBe("retry");
  });

  test("stops retrying after the third failed attempt", () => {
    expect(failureStatusAfterAttempt(2)).toBe("failed");
  });
});
