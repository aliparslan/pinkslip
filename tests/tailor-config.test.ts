import { describe, expect, test } from "bun:test";
import { resolveAppTailorConfig } from "@worker/tailor/config";
import type { Env } from "@worker/types";

describe("tailoring provider configuration", () => {
  test("uses the configured Workers AI model without an API secret", () => {
    const config = resolveAppTailorConfig({
      AI: {} as Ai,
      TAILOR_PROVIDER: "workers_ai",
      WORKERS_AI_MODEL: "@cf/zai-org/glm-4.7-flash",
    } as Env);

    expect(config).toEqual({
      provider: "workers_ai",
      model: "@cf/zai-org/glm-4.7-flash",
    });
  });

  test("does not advertise a configured provider when its binding is absent", () => {
    expect(resolveAppTailorConfig({
      TAILOR_PROVIDER: "workers_ai",
    } as Env)).toBeNull();
  });
});
