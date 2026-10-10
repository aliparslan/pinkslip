import { forwardRef, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "./Text";

/** A label over its control, an optional marker, and an error under it. No
 * helper text slot, as on the web. */
export function Field({ label, optional, error, children }: { label: string; optional?: boolean; error?: string | null; children: ReactNode }) {
  return <View style={styles.field}>
    <Text size="sm" weight="medium" tone="ink-2">{label}{optional ? <Text size="sm" tone="ink-4"> · optional</Text> : null}</Text>
    {children}
    {error ? <Text size="sm" tone="bad" accessibilityRole="alert">{error}</Text> : null}
  </View>;
}

export type InputProps = TextInputProps & { invalid?: boolean };

export const Input = forwardRef<TextInput, InputProps>(function Input({ invalid, style, ...props }, ref) {
  const { theme } = useUnistyles();
  return <TextInput ref={ref} placeholderTextColor={theme.colors["ink-4"]} selectionColor={theme.colors.accent}
    keyboardAppearance={theme.mode === "light" || theme.mode === "lightContrast" ? "light" : "dark"} maxFontSizeMultiplier={1.8}
    {...props} style={[styles.input, invalid && styles.invalid, style]} />;
});

export const Textarea = forwardRef<TextInput, InputProps>(function Textarea(props, ref) {
  return <Input ref={ref} multiline textAlignVertical="top" {...props} style={[styles.textarea, props.style]} />;
});

const styles = StyleSheet.create((theme) => ({
  field: { gap: theme.space["2"] },
  input: {
    minHeight: theme.sizing["control-height"],
    paddingHorizontal: theme.space["4"],
    paddingVertical: theme.space["3"],
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors["control-border"],
    backgroundColor: theme.colors["input-bg"],
    color: theme.colors.ink,
    fontSize: theme.fontSize.md,
  },
  invalid: { borderColor: theme.colors.bad },
  textarea: { minHeight: 112 },
}));
