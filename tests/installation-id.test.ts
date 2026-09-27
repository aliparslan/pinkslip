import { describe, expect, test } from "bun:test";
import { nativeInstallationId } from "../packages/client/src/lib/installation-id";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set("pinkslip-native-installation-id", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("native installation identity", () => {
  test("reuses a valid identity across APNs registrations", () => {
    const existing = "123e4567-e89b-42d3-a456-426614174000";
    expect(nativeInstallationId(memoryStorage(existing), () => crypto.randomUUID()))
      .toBe(existing);
  });

  test("replaces malformed storage with one stable UUID", () => {
    const storage = memoryStorage("bad-value");
    const created = "b73c4c1c-b9e1-4f24-8188-bd013cd0b1a2";
    expect(nativeInstallationId(storage, () => created)).toBe(created);
    expect(nativeInstallationId(storage, () => {
      throw new Error("should not generate twice");
    })).toBe(created);
  });
});
