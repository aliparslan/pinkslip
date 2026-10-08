/* The small parts every screen uses: text on the type scale, SF Symbols,
   the stage label, and the company mark. Each reads the shared tokens. */

import { companyMark } from "@pinkslip/core/utils";
import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState, type ReactNode } from "react";
import { Text, View, type TextProps, type TextStyle } from "react-native";
import { API_ORIGIN, authHeaders } from "../lib/session";
import { raised, type, usePalette, type Palette, type TextVariant } from "../theme";

type Ink = keyof Pick<Palette, "ink" | "ink2" | "ink3" | "accentText" | "accentInk" | "good" | "warn" | "bad">;

export function Txt({
  variant = "ui",
  weight = "regular",
  color = "ink",
  style,
  tabular,
  ...props
}: TextProps & {
  variant?: TextVariant;
  weight?: "regular" | "medium" | "semibold";
  color?: Ink;
  tabular?: boolean;
}) {
  const palette = usePalette();
  const numeric: TextStyle | null = tabular ? { fontVariant: ["tabular-nums"] } : null;
  return <Text {...props} style={[type(variant, weight), { color: palette[color] }, numeric, style]} />;
}

/** An SF Symbol. The web preview has no symbols, so it shows the fallback. */
export function Icon({
  name,
  size = 16,
  color,
  weight = "medium",
  fallback,
}: {
  name: SymbolViewProps["name"];
  size?: number;
  color: string;
  weight?: SymbolViewProps["weight"];
  fallback?: string;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      fallback={fallback ? <Text style={{ fontSize: size * 0.9, lineHeight: size, color, width: size, textAlign: "center" }}>{fallback}</Text> : null}
      style={{ width: size, height: size }}
    />
  );
}

export type Tone = "neutral" | "accent" | "good" | "bad";

/** A stage label: Saved, Applied, Closed. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const palette = usePalette();
  const colors: Record<Tone, [string, string, string]> = {
    neutral: [palette.control, palette.ink2, palette.line],
    accent: [palette.accentSoft, palette.accentSoftInk, palette.accentSoft],
    good: [palette.goodSoft, palette.good, palette.goodSoft],
    bad: [palette.badSoft, palette.bad, palette.badSoft],
  };
  const [background, ink, border] = colors[tone];
  return (
    <View
      style={{
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: background,
        justifyContent: "center",
      }}
    >
      <Text style={[type("caption", "medium"), { color: ink }]}>{children}</Text>
    </View>
  );
}

/** A company's logo on a small raised tile, or its initials until the logo
 * loads (or when there isn't one). */
export function CompanyMark({ name, domain, size = "md" }: { name: string; domain?: string | null; size?: "sm" | "md" }) {
  const palette = usePalette();
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? 24 : 40;
  const logo = size === "sm" ? 16 : 24;
  const showLogo = Boolean(domain) && !failed;
  return (
    <View
      style={[
        raised(palette),
        {
          width: box,
          height: box,
          borderRadius: size === "sm" ? 5 : 8,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
      ]}
    >
      {showLogo ? (
        <Image
          source={{ uri: `${API_ORIGIN}/api/v2/logo?domain=${encodeURIComponent(domain!)}`, headers: authHeaders() }}
          style={{ width: logo, height: logo, borderRadius: 3 }}
          cachePolicy="disk"
          transition={120}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[type(size === "sm" ? "caption" : "ui", "semibold"), { color: palette.ink2, fontSize: size === "sm" ? 10 : 13 }]}>
          {companyMark(name)}
        </Text>
      )}
    </View>
  );
}

/** A hairline between rows, inset to start where the text does. */
export function Separator({ inset = 0 }: { inset?: number }) {
  const palette = usePalette();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: palette.line }} />;
}
