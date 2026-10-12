import * as Font from "expo-font";
import { useSyncExternalStore } from "react";

/** The Klim faces the redesign uses: Founders Grotesk Semibold for display,
 * Untitled Sans for text. They are the trial cuts for now (about 67
 * characters), so iOS draws missing punctuation in the system font. Buy the
 * app licence before an App Store build ships them. */
export const faces = {
  display: "FoundersGrotesk-Semibold",
  text: "UntitledSans-Regular",
  textMedium: "UntitledSans-Medium",
} as const;

let loaded = false;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Loads the faces once. Text draws in the system font until they land. */
export function loadUiFonts(): Promise<void> {
  loading ??= Font.loadAsync({
    [faces.display]: require("../../assets/fonts/FoundersGrotesk-Semibold.otf"),
    [faces.text]: require("../../assets/fonts/UntitledSans-Regular.otf"),
    [faces.textMedium]: require("../../assets/fonts/UntitledSans-Medium.otf"),
  }).then(() => {
    loaded = true;
    for (const listener of listeners) listener();
  }, () => { loading = undefined; });
  return loading;
}

export function useUiFontsLoaded(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => loaded);
}
