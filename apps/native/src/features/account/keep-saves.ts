import { storage } from "../../platform/storage";
import { openSignIn } from "./sign-in-request";

const ASKED = "signIn.keepSavesAsked";

/** M1 (owner, 2026-10-19, Paper "Sign in, code first · Oct 19"): a guest's
 * first save asks, once on this phone, to keep their saves with an account.
 * The save has already happened; Not now leaves it as a guest's. */
export function askToKeepSaves(signedIn: boolean) {
  if (signedIn || storage.getBoolean(ASKED)) return;
  storage.set(ASKED, true);
  openSignIn({ title: "Keep your saved jobs", detail: "So they follow you to a new phone.", notNow: true });
}
