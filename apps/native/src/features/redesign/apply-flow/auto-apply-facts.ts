import type { AutoApplySettings } from "@pinkslip/core/api";

/**
 * What Auto-apply's settings say (Paper "Auto-apply settings · Oct 29"),
 * as plain functions so the screen, You's row and the kit read the same.
 */

/** You's Auto-apply row: Paused, or how a strong match is handled. */
export function autoApplyValue(settings: Pick<AutoApplySettings, "mode" | "paused_until">): string {
  if (settings.paused_until) return "Paused";
  return settings.mode === "auto" ? "Apply for me" : settings.mode === "off" ? "Off" : "Ask me";
}

/** "3 a week" on Free, "Up to 10 a day" on Pro: the plan's sends. */
export function howManyLabel(allowance: { limit: number; per: "day" | "week" } | undefined): string | undefined {
  if (!allowance) return undefined;
  return allowance.per === "day" ? `Up to ${allowance.limit} a day` : `${allowance.limit} a week`;
}

/** The Pause row once paused: "Paused until Fri, Oct 30", or "Paused" until turned back on. */
export function pausedLine(settings: Pick<AutoApplySettings, "paused_until" | "paused_indefinitely">, timeZone?: string): string | null {
  if (!settings.paused_until) return null;
  if (settings.paused_indefinitely) return "Paused";
  const day = new Date(settings.paused_until).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  return `Paused until ${day}`;
}
