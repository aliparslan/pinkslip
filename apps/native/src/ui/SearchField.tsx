import { forwardRef, type ComponentProps } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Floating } from "./Floating";
import { faces, useUiFontsLoaded } from "./fonts";
import { Icon } from "./Icon";

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** The keyboard's Search key. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** Over the page rather than on it (Search's field at the bottom): the
   * page bar's floating material instead of the grey fill. */
  floating?: boolean;
  /** Floating: the magnifier and words, which Search's field fades in as
   * it forms out of the tab bar. */
  contentStyle?: ComponentProps<typeof Animated.View>["style"];
}

/** A search field in the design's pill: the grey fill, a magnifier, and a
 * clear button once there's text. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({ value, onChangeText, placeholder, onSubmit, autoFocus, floating, contentStyle }, ref) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const content = <>
    <Icon name="search" size={18} tone="ink-3" />
    <TextInput ref={ref} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.ui.color["ink-3"]}
      onSubmitEditing={onSubmit} autoFocus={autoFocus} returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="never"
      selectionColor={theme.ui.color.accent} accessibilityRole="search"
      style={[styles.input, { fontFamily: fonts ? faces.text : undefined }]} />
    {value ? <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
      <Icon name="close" size={10} tone="bg" />
    </Pressable> : null}
  </>;
  // Floating, the glass fills whatever height it's given (it starts as the
  // tab bar's pill) with the field's row in its middle.
  if (floating) return <Floating style={styles.floating}><Animated.View style={[styles.field, styles.floatingRow, contentStyle]}>{content}</Animated.View></Floating>;
  return <View style={[styles.field, styles.onPage]}>{content}</View>;
});

const styles = StyleSheet.create((theme) => ({
  field: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["2"],
    paddingHorizontal: theme.ui.space["4"],
  },
  onPage: { borderRadius: 22, backgroundColor: theme.ui.color.fill },
  floating: { flex: 1, borderRadius: theme.ui.radius.full, justifyContent: "center" },
  floatingRow: { flex: 0 },
  input: { flex: 1, height: 44, fontSize: theme.ui.type.body.size, color: theme.ui.color.ink, padding: 0 },
  clear: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color["ink-4"] },
}));
