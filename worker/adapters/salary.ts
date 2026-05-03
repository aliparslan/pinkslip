/**
 * Shared salary formatting utilities for ATS adapters.
 */

interface GreenhousePayRange {
  min_cents: number;
  max_cents: number;
  currency_type: string;
  title: string;
}

interface LeverSalaryRange {
  min: number;
  max: number;
  currency: string;
  interval: string;
}

/**
 * Formats a Greenhouse pay_input_range into a human-readable salary string.
 * Returns null if the range is not provided.
 */
export function formatGreenhouseSalary(range: GreenhousePayRange | undefined): string | null {
  if (!range) return null;
  const min = Math.round(range.min_cents / 100).toLocaleString();
  const max = Math.round(range.max_cents / 100).toLocaleString();
  const prefix = range.currency_type === "USD" ? "$" : `${range.currency_type} `;
  let salary = `${prefix}${min} – ${prefix}${max}`;
  if (range.title) salary += ` (${range.title})`;
  return salary;
}

/**
 * Formats a Lever salaryRange into a human-readable salary string.
 * Returns null if the range is not provided.
 */
export function formatLeverSalary(range: LeverSalaryRange | undefined): string | null {
  if (!range) return null;
  const { min, max, currency, interval } = range;
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${min.toLocaleString()} – ${prefix}${max.toLocaleString()}/${interval}`;
}
