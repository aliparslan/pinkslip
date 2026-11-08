import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { storage } from "../platform/storage";
import { Text } from "./Text";

export interface CompanyLogoProps {
  name: string;
  /** The logo image. Without one, the tile shows the first letter. */
  uri?: string | null;
  /** The brand colour behind the letter when there's no image. */
  color?: string;
  /** 40 in rows, 48 on a page; 32 in a card's list (the review), 28 two
   * to a slot (stacked). */
  size?: "row" | "page" | "card" | "stack";
}

/** What the API said about each logo: true for a full square. */
const known = new Map<string, boolean>();
const asking = new Map<string, Promise<void>>();
/** Answers are kept a week, then asked again: a company can change its logo. */
const KEEP = 7 * 24 * 60 * 60 * 1000;

function remembered(shape: string): { fills: boolean; fresh: boolean } | null {
  const inMemory = known.get(shape);
  if (inMemory !== undefined) return { fills: inMemory, fresh: true };
  try {
    const saved = JSON.parse(storage.getString(`logo-shape:${shape}`) ?? "null") as { fills?: unknown; at?: unknown } | null;
    if (typeof saved?.fills !== "boolean" || typeof saved.at !== "number") return null;
    return { fills: saved.fills, fresh: Date.now() - saved.at < KEEP };
  } catch {
    return null;
  }
}

function ask(shape: string): Promise<void> {
  const pending = asking.get(shape);
  if (pending) return pending;
  // Only a real answer is kept: a miss or an older API asks again later.
  const request = fetch(shape)
    .then((response) => (response.ok ? response.json() as Promise<{ fills?: unknown }> : null))
    .then((body) => {
      if (typeof body?.fills !== "boolean") return;
      known.set(shape, body.fills);
      storage.set(`logo-shape:${shape}`, JSON.stringify({ fills: body.fills, at: Date.now() }));
    })
    .catch(() => undefined)
    .finally(() => asking.delete(shape));
  asking.set(shape, request);
  return request;
}

/** Whether the logo at `uri` is a full square that fills its tile. The API's
 * `/logo/shape` looks (worker/logo-shape.ts) and the phone keeps the answer,
 * so a row draws right away from the second time on. Inset until it knows. */
function useFills(uri: string | null | undefined): boolean {
  const shape = uri?.includes("/logo?") ? uri.replace("/logo?", "/logo/shape?") : null;
  const [fills, setFills] = useState(() => (shape ? remembered(shape)?.fills ?? false : false));
  useEffect(() => {
    if (!shape) return setFills(false);
    const answer = remembered(shape);
    if (answer) setFills(answer.fills);
    if (answer?.fresh) return;
    let live = true;
    void ask(shape).then(() => {
      const fresh = known.get(shape);
      if (live && fresh !== undefined) setFills(fresh);
    });
    return () => { live = false; };
  }, [shape]);
  return fills;
}

/** Logos sit on a white tile in both modes with a faint outline, so a dark
 * logo keeps its edge on graphite. Square logos fill the tile; marks, circles
 * and the letter for a company without a logo sit inset on white (owner,
 * 2026-11-08, Paper "Critic fixes · Nov 8", B). 40pt in rows, 48 on a page;
 * the corner is a quarter of the size (10 and 12). */
export function CompanyLogo({ name, uri, color, size = "row" }: CompanyLogoProps) {
  styles.useVariants({ size });
  // A logo that fails to load falls back to the letter.
  const [failed, setFailed] = useState<string | null>(null);
  const fills = useFills(uri);
  if (uri && failed !== uri) {
    return <View style={[styles.tile, styles.white]} accessibilityElementsHidden>
      <Image source={{ uri }} style={fills ? styles.filled : styles.image} resizeMode={fills ? "cover" : "contain"} onError={() => setFailed(uri)} />
    </View>;
  }
  return <View style={[styles.tile, color ? { backgroundColor: color } : styles.white]} accessibilityElementsHidden>
    <Text role={size === "page" ? "title2" : size === "row" ? "body" : "footnote"} weight="medium" tone={color ? "bg" : "ink-3"}>{name.trim().charAt(0).toUpperCase()}</Text>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderCurve: "continuous",
    variants: {
      size: {
        row: { width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4 },
        page: { width: theme.ui.size.logoLarge, height: theme.ui.size.logoLarge, borderRadius: theme.ui.size.logoLarge / 4 },
        card: { width: 32, height: 32, borderRadius: 8 },
        stack: { width: 28, height: 28, borderRadius: 7 },
      },
    },
  },
  white: { backgroundColor: theme.ui.color["logo-tile"], borderWidth: StyleSheet.hairlineWidth, borderColor: theme.ui.color["image-outline"] },
  image: { width: "80%", height: "80%" },
  filled: { width: "100%", height: "100%" },
}));
