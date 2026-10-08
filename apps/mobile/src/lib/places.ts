/* Where a job is and what it pays there, with your cities first. */

import type { Job } from "@pinkslip/core/api";
import { formatRowLocation, jobLocationParts, jobPayBands, type PayBand } from "@pinkslip/core/job-format";

export const isMine = (place: string, yours: string[]) => {
  const lower = place.toLowerCase();
  return yours.some((alias) => lower.includes(alias));
};

export function placesOf(job: Job, yours: string[]): string[] {
  const places = jobLocationParts(job.location);
  return [...places.filter((place) => isMine(place, yours)), ...places.filter((place) => !isMine(place, yours))];
}

const cityOf = (place: string) => place.split(",")[0]!.trim().toLowerCase();

/** The band a posting gives for a place, matched by city name. */
export const bandFor = (place: string, bands: PayBand[]) =>
  bands.find((band) => band.region?.toLowerCase().includes(cityOf(place))) ?? null;

/** The full spread across bands: "$140–200K". One band reads as itself. */
export function payRange(bands: PayBand[]): string | null {
  if (bands.length < 2) return bands[0]?.amount ?? null;
  const ranges = bands.map((band) => band.amount.match(/^\$(\d+)–(\d+)K$/));
  if (ranges.some((range) => !range)) return bands[0]!.amount;
  return `$${Math.min(...ranges.map((range) => Number(range![1])))}–${Math.max(...ranges.map((range) => Number(range![2])))}K`;
}

/** Too many places for one line, or pay that depends on place. */
export const needsPlaceSheet = (job: Job) => jobPayBands(job.salary).length > 1 || jobLocationParts(job.location).length > 3;

/** "New York or Remote", "Austin, Denver, or Remote". */
export function joinPlaces(places: string[]): string {
  const short = places.map((place) => formatRowLocation(place) ?? place);
  if (short.length < 3) return short.join(" or ");
  return `${short.slice(0, -1).join(", ")}, or ${short.at(-1)}`;
}

export { jobPayBands };
