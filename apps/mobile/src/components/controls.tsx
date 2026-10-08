/* Buttons, chips, and the search field, sized by the same rule as the web:
   small 28 with 13pt type, medium 36 with 14pt, large 44 with 16pt. */

import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { accentFill, control, pressedScale, raised, type, usePalette } from "../theme";
import { Icon } from "./primitives";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const sizes: Record<ButtonSize, { height: number; padding: number; text: "meta" | "ui" | "body" }> = {
  sm: { height: control.sm, padding: 12, text: "meta" },
  md: { height: control.md, padding: 16, text: "ui" },
  lg: { height: control.lg, padding: 20, text: "body" },
};

export function Button({
  variant = "secondary",
  size = "md",
  children,
  leading,
  trailing,
  style,
  haptic,
  onPress,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** A light tap on press, for actions that change something. */
  haptic?: boolean;
}) {
  const palette = usePalette();
  const metrics = sizes[size];
  const ink = variant === "primary" ? palette.accentInk : variant === "ghost" ? palette.ink2 : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      onPress={(event) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      style={({ pressed }) => [
        {
          height: metrics.height,
          paddingHorizontal: metrics.padding,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        variant === "primary" ? accentFill(palette) : variant === "secondary" ? raised(palette) : null,
        variant === "ghost" && pressed ? { backgroundColor: palette.control } : null,
        pressed ? pressedScale : null,
        props.disabled ? { opacity: 0.45 } : null,
        style,
      ]}
    >
      {leading}
      {children !== undefined ? (
        <Text numberOfLines={1} style={[type(metrics.text, "medium"), { color: ink }]}>
          {children}
        </Text>
      ) : null}
      {trailing}
    </Pressable>
  );
}

/** A filter pill. Small in the row under a search field, medium as a choice
 * inside a sheet. Pressing it in draws an ink ring. */
export function Chip({
  label,
  count,
  pressed: on = false,
  menu = false,
  size = "sm",
  onPress,
}: {
  label: string;
  count?: number;
  pressed?: boolean;
  /** Opens a sheet of choices rather than toggling. */
  menu?: boolean;
  size?: "sm" | "md";
  onPress: () => void;
}) {
  const palette = usePalette();
  const padding = size === "sm" ? 12 : 14;
  const text = size === "sm" ? "meta" : "ui";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: size === "sm" ? control.sm : control.md,
          paddingHorizontal: padding,
          borderRadius: 999,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: palette.raised,
          borderWidth: on ? 2 : 1,
          borderColor: on ? palette.ink : palette.line2,
        },
        on ? { paddingHorizontal: padding - 1 } : null,
        pressed ? pressedScale : null,
      ]}
    >
      <Text style={[type(text, "medium"), { color: palette.ink }]}>{label}</Text>
      {count !== undefined ? <Text style={[type(text, "medium"), { color: palette.ink3, fontVariant: ["tabular-nums"] }]}>{count}</Text> : null}
      {menu ? <Icon name="chevron.down" size={11} color={palette.ink3} weight="semibold" fallback="⌄" /> : null}
    </Pressable>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        height: control.lg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.line2,
        backgroundColor: palette.field,
        boxShadow: `inset 0 1px 2px ${palette.skinInset}`,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      <Icon name="magnifyingglass" size={17} color={palette.ink3} fallback="⌕" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.ink3}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
        style={[type("body"), { flex: 1, height: "100%", color: palette.ink, paddingVertical: 0 }]}
      />
    </View>
  );
}
