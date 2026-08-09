import type { Env } from "../types";

export const DEFAULT_WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash";

export const WORKERS_AI_TAILOR_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/openai/gpt-oss-120b",
] as const;

export type WorkersAiTailorModel = (typeof WORKERS_AI_TAILOR_MODELS)[number];

export function normalizeWorkersAiModel(model: string | undefined): WorkersAiTailorModel {
  const normalized = model?.trim();
  return WORKERS_AI_TAILOR_MODELS.find((candidate) => candidate === normalized)
    ?? DEFAULT_WORKERS_AI_MODEL;
}

export function resolveAppTailorConfig(
  env: Env
): { provider: "workers_ai"; model: WorkersAiTailorModel } | null {
  return env.AI
    ? { provider: "workers_ai", model: normalizeWorkersAiModel(env.WORKERS_AI_MODEL) }
    : null;
}
