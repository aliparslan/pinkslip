import { writable } from "svelte/store";
import type { MeResponse } from "./api";
import { setViewedJobsSession } from "./viewed";

interface SessionAccess {
  role: "user" | "admin";
  isAdmin: boolean;
}

export const sessionAccess = writable<SessionAccess>({
  role: "user",
  isAdmin: false,
});

export function syncSessionAccess(response: MeResponse) {
  setViewedJobsSession(response.user?.id ?? null);
  sessionAccess.set({
    role: response.user?.role ?? "user",
    isAdmin: response.is_admin === true,
  });
}
