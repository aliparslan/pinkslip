import { createEventInCalendarAsync, requestCalendarPermissionsAsync } from "expo-calendar/legacy";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { storage } from "../../platform/storage";
import { toast } from "../../ui";
import { plainText } from "./job-facts";
import { interviewEvent } from "./application-facts";

/**
 * Add to Calendar (owner, 2026-11-08; Paper "Calendar and alert buttons"):
 * iOS's own New Event sheet, filled in, so Pinkslip never reads the calendar.
 * The phone remembers which date was added, so a moved interview asks again.
 */
const key = (applicationId: string) => `in-calendar:${applicationId}`;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useInCalendar(applicationId: string, when: string): boolean {
  return useSyncExternalStore(subscribe, () => storage.getString(key(applicationId)) === when);
}

type Event = ReturnType<typeof interviewEvent>;

/** Since iOS 17 the sheet needs no permission; before that it does. */
async function openNewEvent(event: Event) {
  if (Number.parseInt(String(Platform.Version), 10) < 17) {
    const { granted } = await requestCalendarPermissionsAsync();
    if (!granted) throw new Error("Calendar permission denied");
  }
  return createEventInCalendarAsync(event);
}

export async function addInterviewToCalendar(application: { id: string; company: string; role: string }, when: string): Promise<void> {
  try {
    const event = interviewEvent({ company: plainText(application.company), role: plainText(application.role), when });
    const result = await openNewEvent(event);
    if (result.action !== "saved") return;
    storage.set(key(application.id), when);
    listeners.forEach((listener) => listener());
  } catch {
    toast.error("Couldn't open Calendar. Try again.");
  }
}
