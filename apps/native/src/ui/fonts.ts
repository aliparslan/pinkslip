import type { TextStyle } from "react-native";

/**
 * The app draws in SF, the system font, for now (owner, 2026-11-04: getting
 * ready for the App Store before the Klim licences are bought; the trial
 * cuts can't ship in a store build, so nothing here loads them). `face` is
 * the one switch: each role's family and weight. SF Mono isn't open to apps,
 * so the stub's stamps keep SF with even-width digits.
 *
 * Back to Klim once licensed: point `face` at `klim` (with no weights; each
 * file is its own), and load the files from assets/fonts in loadUiFonts:
 * FoundersGrotesk-Semibold, UntitledSans-Regular and -Medium, and
 * FoundersGroteskMono-Medium and -Regular.
 */
export const klim = {
  display: "FoundersGrotesk-Semibold",
  text: "UntitledSans-Regular",
  textMedium: "UntitledSans-Medium",
  stamp: "FoundersGroteskMono-Medium",
  stampDetail: "FoundersGroteskMono-Regular",
} as const;

type Face = Pick<TextStyle, "fontFamily" | "fontWeight" | "fontVariant">;

export const face = {
  display: { fontFamily: "System", fontWeight: "600" },
  text: { fontFamily: "System", fontWeight: "400" },
  textMedium: { fontFamily: "System", fontWeight: "500" },
  stamp: { fontFamily: "System", fontWeight: "500", fontVariant: ["tabular-nums"] },
  stampDetail: { fontFamily: "System", fontWeight: "400", fontVariant: ["tabular-nums"] },
} as const satisfies Record<keyof typeof klim, Face>;

/** Nothing to load while the app is on SF. */
export function loadUiFonts(): Promise<void> {
  return Promise.resolve();
}

/** False while on SF, so text and fields take the system font and a weight. */
export function useUiFontsLoaded(): boolean {
  return false;
}
