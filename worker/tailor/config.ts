import type { Env } from "../types";
import type { TailorProvider } from "./usage";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
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

function configuredProvider(env: Env, provider: TailorProvider): boolean {
  if (provider === "workers_ai") return Boolean(env.AI);
  if (provider === "gemini") return Boolean(env.GEMINI_API_KEY?.trim());
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export function resolveAppTailorConfig(
  env: Env
): { provider: TailorProvider; model: string } | null {
  const requested = env.TAILOR_PROVIDER?.trim();
  if (
    (requested === "workers_ai" || requested === "gemini" || requested === "anthropic")
    && configuredProvider(env, requested)
  ) {
    return {
      provider: requested,
      model: requested === "workers_ai"
        ? normalizeWorkersAiModel(env.WORKERS_AI_MODEL)
        : requested === "gemini"
          ? env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
          : env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  if (configuredProvider(env, "gemini")) {
    return { provider: "gemini", model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL };
  }
  if (configuredProvider(env, "workers_ai")) {
    return { provider: "workers_ai", model: normalizeWorkersAiModel(env.WORKERS_AI_MODEL) };
  }
  if (configuredProvider(env, "anthropic")) {
    return { provider: "anthropic", model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL };
  }
  return null;
}
