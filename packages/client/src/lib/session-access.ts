import { writable } from "svelte/store";
import type { AccountInfo, AppFeatures, MeResponse, User } from "@pinkslip/core/api";
import { setViewedJobsSession } from "./viewed";
import { setJobLibraryOwner } from "./job-library-store";

export interface SessionAccess {
  state: "anonymous" | "guest" | "authenticated";
  user: User | null;
  account: AccountInfo | null;
  features: AppFeatures | null;
  role: "user" | "admin";
  isAdmin: boolean;
}

export const sessionAccess = writable<SessionAccess>({
  state: "anonymous",
  user: null,
  account: null,
  features: null,
  role: "user",
  isAdmin: false,
});

export function syncSessionAccess(response: MeResponse) {
  setViewedJobsSession(response.user?.id ?? null);
  setJobLibraryOwner(response.user?.id ?? null);
  sessionAccess.set({
    state: response.session.state,
    user: response.user,
    account: response.account,
    features: response.features ?? null,
    role: response.user?.role ?? "user",
    isAdmin: response.is_admin === true,
  });
}
