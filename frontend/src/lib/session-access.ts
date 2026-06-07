import { writable } from "svelte/store";
import type { MeResponse } from "./api";

interface SessionAccess {
  role: "user" | "admin";
  isAdmin: boolean;
}

export const sessionAccess = writable<SessionAccess>({
  role: "user",
  isAdmin: false,
});

export function syncSessionAccess(response: MeResponse) {
  sessionAccess.set({
    role: response.user?.role ?? "user",
    isAdmin: response.is_admin === true,
  });
}
