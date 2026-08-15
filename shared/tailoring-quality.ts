export interface TailoringQualitySnapshot {
  sampleSize: number;
  unsupportedClaimRate: number;
  requirementSourceCoverage: number;
  onePageRate: number;
  averageRemovedItems: number;
  averageEditDistance: number;
  deviceFailureRate: number;
  p95LatencyMs: number;
  averageInputTokens: number;
  averageOutputTokens: number;
  artifactAcceptanceRate: number;
}

export const TAILORING_QUALITY_GATES = {
  minimumSampleSize: 20,
  maximumUnsupportedClaimRate: 0,
  minimumRequirementSourceCoverage: 0.98,
  minimumOnePageRate: 0.75,
  maximumAverageRemovedItems: 2,
  maximumDeviceFailureRate: 0.03,
  maximumP95LatencyMs: 30_000,
  minimumArtifactAcceptanceRate: 0.6,
} as const;

export type TailoringQualityGate = keyof typeof TAILORING_QUALITY_GATES;

export interface TailoringQualityEvaluation {
  ready: boolean;
  insufficientSample: boolean;
  failed: Array<{ gate: TailoringQualityGate; actual: number; target: number }>;
}

/** These gates must pass before Pinkslip may enable any supervised ATS beta. */
export function evaluateTailoringQuality(
  snapshot: TailoringQualitySnapshot,
): TailoringQualityEvaluation {
  const failed: TailoringQualityEvaluation["failed"] = [];
  const maximum = (gate: TailoringQualityGate, actual: number, target: number) => {
    if (actual > target) failed.push({ gate, actual, target });
  };
  const minimum = (gate: TailoringQualityGate, actual: number, target: number) => {
    if (actual < target) failed.push({ gate, actual, target });
  };
  maximum("maximumUnsupportedClaimRate", snapshot.unsupportedClaimRate, TAILORING_QUALITY_GATES.maximumUnsupportedClaimRate);
  minimum("minimumRequirementSourceCoverage", snapshot.requirementSourceCoverage, TAILORING_QUALITY_GATES.minimumRequirementSourceCoverage);
  minimum("minimumOnePageRate", snapshot.onePageRate, TAILORING_QUALITY_GATES.minimumOnePageRate);
  maximum("maximumAverageRemovedItems", snapshot.averageRemovedItems, TAILORING_QUALITY_GATES.maximumAverageRemovedItems);
  maximum("maximumDeviceFailureRate", snapshot.deviceFailureRate, TAILORING_QUALITY_GATES.maximumDeviceFailureRate);
  maximum("maximumP95LatencyMs", snapshot.p95LatencyMs, TAILORING_QUALITY_GATES.maximumP95LatencyMs);
  minimum("minimumArtifactAcceptanceRate", snapshot.artifactAcceptanceRate, TAILORING_QUALITY_GATES.minimumArtifactAcceptanceRate);
  const insufficientSample = snapshot.sampleSize < TAILORING_QUALITY_GATES.minimumSampleSize;
  return { ready: !insufficientSample && failed.length === 0, insufficientSample, failed };
}
