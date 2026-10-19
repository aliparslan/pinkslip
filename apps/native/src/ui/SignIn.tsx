import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, TextInput, View, type TextInputProps } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { faces, useUiFontsLoaded } from "./fonts";
import { Icon } from "./Icon";
import { SHEET_GROUP_RADIUS } from "./sheet-geometry";
import { Text, type TextTone } from "./Text";

/**
 * The sign-in sheet's parts (Paper "Sign in · Oct 15", S1 approved as K1):
 * the three ways in as 50 capsules 12 apart, the email field, and the
 * six-digit code.
 */

export type SignInProvider = "apple" | "google" | "email";

/** Apple's logo, from Apple's Sign in with Apple kit, path unaltered; the
 * viewBox sets the glyph as tall as the label's type, as Apple asks. */
const APPLE_LOGO = "M15.7099491,14.8846154 C16.5675461,14.8846154 17.642562,14.3048315 18.28274,13.5317864 C18.8625238,12.8312142 19.2852829,11.852829 19.2852829,10.8744437 C19.2852829,10.7415766 19.2732041,10.6087095 19.2490464,10.5 C18.2948188,10.5362365 17.1473299,11.140178 16.4588366,11.9494596 C15.9152893,12.56548 15.4200572,13.5317864 15.4200572,14.5222505 C15.4200572,14.6671964 15.4442149,14.8121424 15.4562937,14.8604577 C15.5166879,14.8725366 15.6133185,14.8846154 15.7099491,14.8846154 Z M12.6902416,29.5 C13.8618881,29.5 14.3812778,28.714876 15.8428163,28.714876 C17.3285124,28.714876 17.6546408,29.4758423 18.9591545,29.4758423 C20.2395105,29.4758423 21.0971074,28.292117 21.9063891,27.1325493 C22.8123013,25.8038779 23.1867451,24.4993643 23.2109027,24.4389701 C23.1263509,24.4148125 20.6743484,23.4122695 20.6743484,20.5979021 C20.6743484,18.1579784 22.6069612,17.0588048 22.7156707,16.974253 C21.4353147,15.1382708 19.490623,15.0899555 18.9591545,15.0899555 C17.5217737,15.0899555 16.3501271,15.9596313 15.6133185,15.9596313 C14.8161157,15.9596313 13.7652575,15.1382708 12.521138,15.1382708 C10.1536872,15.1382708 7.75,17.0950413 7.75,20.7911634 C7.75,23.0861411 8.64383344,25.513986 9.74300699,27.0842339 C10.6851558,28.4129053 11.5065162,29.5 12.6902416,29.5 Z";

export function AppleLogo({ size = 18, color }: { size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="4.79 9.31 21.38 21.38"><Path d={APPLE_LOGO} fill={color} /></Svg>;
}

/** Google's "G" from Google's sign-in kit (2026), drawn from its SVG with the
 * button's own background left out; Google's gradient can't be drawn by
 * react-native-svg, so it ships as an image. The G fills its square where
 * Apple's logo sits inside its 18, so 16 stands it as tall (owner,
 * 2026-10-18: at 18 it looked too large). */
export function GoogleLogo({ size = 16 }: { size?: number }) {
  return <Image source={require("../../assets/brand/google-g.png")} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}

export interface ProviderButtonProps {
  provider: SignInProvider;
  pending?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}

/**
 * A way in: Apple black (white in dark mode, as Apple asks on dark
 * backgrounds), Google white with a hairline, email on the grey fill. Each
 * leads with its own mark at 18 and the label in Body Medium.
 */
export function ProviderButton({ provider, pending, disabled, onPress, children }: ProviderButtonProps) {
  const { theme } = useUnistyles();
  const light = theme.mode === "light" || theme.mode === "lightContrast";
  styles.useVariants({ provider });
  // Apple's own button colours: black on light, white on dark.
  const appleInk = light ? "#ffffff" : "#000000";
  const tone: TextTone = provider === "apple" ? (light ? "accent-ink" : "bg") : "ink";
  const inactive = disabled || pending;
  const mark = provider === "apple" ? <AppleLogo color={appleInk} />
    : provider === "google" ? <GoogleLogo />
    : <Icon name="email" size={20} tone="ink" />;
  return <PressableScale accessibilityRole="button" accessibilityState={{ disabled: inactive, busy: pending }} disabled={inactive}
    onPress={onPress} style={styles.full} contentStyle={[styles.button, provider === "apple" && { backgroundColor: light ? "#000000" : "#ffffff" }]}>
    {pending ? <ActivityIndicator size="small" color={provider === "apple" ? appleInk : theme.ui.color.ink} /> : mark}
    <Text role="body" weight="medium" tone={tone} lines={1}>{children}</Text>
  </PressableScale>;
}

export interface SignInFieldProps extends Pick<TextInputProps, "keyboardType" | "textContentType" | "autoComplete" | "returnKeyType" | "onSubmitEditing" | "autoFocus"> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** What's wrong, in a thin `bad` ring; the sheet says it under the field. */
  invalid?: boolean;
}

/** A standalone field on the sheet: white at the sheet group's radius, its
 * label always above the value (S2), the sign-in ring when it's wrong (E1). */
export function SignInField({ label, value, onChangeText, invalid, keyboardType, textContentType, autoComplete, returnKeyType, onSubmitEditing, autoFocus }: SignInFieldProps) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  styles.useVariants({ invalid: Boolean(invalid) });
  return <View style={styles.field}>
    <Text role="footnote" tone="ink-3">{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} accessibilityLabel={label} autoFocus={autoFocus}
      keyboardType={keyboardType} textContentType={textContentType} autoComplete={autoComplete} autoCapitalize="none" autoCorrect={false}
      returnKeyType={returnKeyType} onSubmitEditing={onSubmitEditing} selectionColor={theme.ui.color.accent}
      style={[styles.input, { fontFamily: fonts ? faces.text : undefined }]} />
  </View>;
}

export interface CodeBoxesProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Wrong: every box takes the `bad` ring (E6). */
  invalid?: boolean;
  /** Expired: the digits go grey (E7). */
  faded?: boolean;
  autoFocus?: boolean;
}

export const CODE_LENGTH = 6;

/**
 * The six-digit code (S4): six white boxes, the digit in Title 1, the next
 * box ringed in pink with its caret. One hidden field takes the typing, so
 * iPhone can fill the code in from Mail.
 */
export function CodeBoxes({ value, onChangeText, invalid, faded, autoFocus = true }: CodeBoxesProps) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");
  return <Pressable onPress={() => input.current?.focus()} accessibilityLabel={`Code, ${value.length} of ${CODE_LENGTH} digits`}>
    <View style={styles.boxes}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const current = focused && !invalid && index === Math.min(value.length, CODE_LENGTH - 1) && value.length < CODE_LENGTH;
        return <View key={index} style={[styles.box, current && styles.boxCurrent, invalid && digits[index] && styles.boxInvalid]}>
          {digits[index] ? <Text role="title1" tone={faded ? "ink-3" : "ink"}>{digits[index]}</Text> : current ? <View style={styles.caret} /> : null}
        </View>;
      })}
    </View>
    <TextInput ref={input} value={value} autoFocus={autoFocus} maxLength={CODE_LENGTH} keyboardType="number-pad"
      textContentType="oneTimeCode" autoComplete="one-time-code" caretHidden
      onChangeText={(text) => onChangeText(text.replace(/\D/g, "").slice(0, CODE_LENGTH))}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={styles.hidden} />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  full: { alignSelf: "stretch" },
  button: {
    minHeight: theme.ui.size.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.ui.space["2"],
    paddingHorizontal: theme.ui.space["6"],
    borderRadius: theme.ui.radius.full,
    variants: {
      provider: {
        apple: {},
        google: { backgroundColor: theme.ui.color["sheet-group"], borderWidth: 1, borderColor: theme.ui.color.outline },
        email: { backgroundColor: theme.ui.color.fill },
      },
    },
  },
  field: {
    gap: 2,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    borderWidth: 1.5,
    backgroundColor: theme.ui.color["sheet-group"],
    variants: {
      invalid: {
        true: { borderColor: theme.ui.color.bad },
        false: { borderColor: "transparent" },
      },
    },
  },
  input: { padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  boxes: { flexDirection: "row", gap: 9 },
  box: {
    flex: 1,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.ui.radius.md,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: theme.ui.color["sheet-group"],
  },
  boxCurrent: { borderColor: theme.ui.color["accent-fill"] },
  boxInvalid: { borderColor: theme.ui.color.bad },
  caret: { width: 2, height: 28, borderRadius: 1, backgroundColor: theme.ui.color["accent-fill"] },
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0 },
}));
