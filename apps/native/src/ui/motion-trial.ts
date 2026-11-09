import { useSyncExternalStore } from "react";
import { storage } from "../platform/storage";

/**
 * The Nov 8 motion fixes (Paper "Motion fixes before 1.4.0 · Nov 8",
 * docs/motion-fixes-2026-11-08.md), each beside what it replaces. The owner
 * asked for all six built as kit toggles (2026-11-08): the proposal is on,
 * and Kit → Motion fixes switches any one back to today's, kept on this
 * phone, so each can be felt both ways before the old one goes.
 *
 * Three more are the first signature moments (Paper "Signature moments
 * · Nov 8", docs/signature-moments-2026-11-08.md), built the same way. The
 * last two are lists changing under you, picked in Kit on Nov 8
 * (docs/next-five-round-2026-11-08.md).
 */
export type MotionTrial = "undo" | "sheetFade" | "wheel" | "trackerLoad" | "pdfSettle"
  | "zoom" | "stampBar" | "stampOffer" | "trackerMove" | "jobsArrive" | "todayZoom" | "zoomLanding";

export const MOTION_TRIALS: { id: MotionTrial; title: string; today: string; proposed: string }[] = [
  { id: "undo", title: "Undo brings the job back", today: "It appears in one frame", proposed: "Hide played backwards" },
  { id: "sheetFade", title: "Steps in a sheet", today: "Each step its own card, sliding", proposed: "One sheet, steps fade" },
  { id: "wheel", title: "The month wheel and Ended", today: "They jump", proposed: "They open and fold" },
  { id: "trackerLoad", title: "Tracker loading", today: "Rows land at once", proposed: "Tracker's shape, rows fade in" },
  { id: "pdfSettle", title: "A read resume", today: "The bar stops, a card flies in", proposed: "The bar finishes, it settles" },
  { id: "zoom", title: "A job grows out of its row", today: "It slides in", proposed: "It zooms out of the row" },
  { id: "stampBar", title: "SENT on the live bar", today: "A green check and a close", proposed: "SENT lands, the bar turns to the job" },
  { id: "stampOffer", title: "OFFER, once", today: "Among the stamps", proposed: "Lands on the stub once, in green" },
  { id: "trackerMove", title: "A row changes stage", today: "It jumps when the server answers", proposed: "It moves at once, in place" },
  { id: "jobsArrive", title: "New postings arrive", today: "They appear at once", proposed: "The rows make room and uncover them" },
  { id: "todayZoom", title: "Today's rows", today: "They slide in", proposed: "They zoom out of the row" },
  // Lines the page's logo and title up with the row's as it zooms (owner, Nov 8:
  // the page's title landed a row too low, over the next row's text).
  { id: "zoomLanding", title: "Zoom lands on the title", today: "The page's top lands on the row", proposed: "Its logo and title land on the row's" },
];

const key = (id: MotionTrial) => `kit-motion-${id}`;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Whether the proposal is on: everywhere unless it was switched back. */
export function motionTrial(id: MotionTrial): boolean {
  return storage.getString(key(id)) !== "today";
}

export function setMotionTrial(id: MotionTrial, proposed: boolean) {
  if (proposed) storage.remove(key(id));
  else storage.set(key(id), "today");
  for (const listener of listeners) listener();
}

export function useMotionTrial(id: MotionTrial): boolean {
  return useSyncExternalStore(subscribe, () => motionTrial(id));
}
