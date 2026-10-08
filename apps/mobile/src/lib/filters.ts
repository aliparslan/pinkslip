/* The Jobs filters, shared between the Jobs screen and the filter sheets. */

import { useSyncExternalStore } from "react";
import { LOCATION_OPTIONS } from "@pinkslip/domain/search-profile";

export interface FeedFilters {
  query: string;
  /** Location ids, plus "Remote". Empty follows the search profile. */
  locations: string[];
  /** Thousands of dollars a year, or null for any pay. */
  minPayK: number | null;
  newOnly: boolean;
}

let filters: FeedFilters = { query: "", locations: [], minPayK: null, newOnly: false };
const listeners = new Set<() => void>();

export function setFilters(update: Partial<FeedFilters>): void {
  filters = { ...filters, ...update };
  for (const listener of listeners) listener();
}

export function useFilters(): FeedFilters {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => filters,
  );
}

export const locationChoices = [
  { id: "Remote", label: "Remote" },
  ...LOCATION_OPTIONS.map((option) => ({ id: option.id, label: option.label.replace(/, [A-Z]{2}$/, "") })),
];

export const payChoices = [80, 100, 120, 140, 160, 180];

export function locationSummary(ids: string[]): string {
  if (!ids.length) return "Location";
  const labels = ids.map((id) => locationChoices.find((choice) => choice.id === id)?.label.split(" / ")[0] ?? id);
  return labels.length <= 1 ? labels[0]! : `${labels[0]} +${labels.length - 1}`;
}
