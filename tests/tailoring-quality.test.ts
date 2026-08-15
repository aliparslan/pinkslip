import { describe, expect, test } from "bun:test";
import { evaluateTailoringQuality } from "../shared/tailoring-quality";

describe("tailoring quality release gates", () => {
  const healthy = {
    sampleSize: 30,
    unsupportedClaimRate: 0,
    requirementSourceCoverage: 1,
    onePageRate: 0.8,
    averageRemovedItems: 1.2,
    averageEditDistance: 0.18,
    deviceFailureRate: 0.01,
    p95LatencyMs: 18_000,
    averageInputTokens: 2400,
    averageOutputTokens: 900,
    artifactAcceptanceRate: 0.7,
  };

  test("requires a real evaluation sample before supervised applying", () => {
    expect(evaluateTailoringQuality({ ...healthy, sampleSize: 4 })).toMatchObject({
      ready: false,
      insufficientSample: true,
    });
  });

  test("blocks when any unsupported claim survives validation", () => {
    const result = evaluateTailoringQuality({ ...healthy, unsupportedClaimRate: 0.01 });
    expect(result.ready).toBe(false);
    expect(result.failed.map((item) => item.gate)).toContain("maximumUnsupportedClaimRate");
  });

  test("marks a measured healthy system ready for a supervised beta", () => {
    expect(evaluateTailoringQuality(healthy)).toEqual({
      ready: true,
      insufficientSample: false,
      failed: [],
    });
  });
});
