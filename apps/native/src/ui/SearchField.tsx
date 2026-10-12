import { forwardRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "./fonts";
import { Icon } from "./Icon";

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** The keyboard's Search key. */
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/** A search field in the design's pill: the grey fill, a magnifier, and a
 * clear button once there's text. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({ value, onChangeText, placeholder, onSubmit, autoFocus }, ref) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  return <View style={styles.field}>
    <Icon name="search" size={18} tone="ink-3" />
    <TextInput ref={ref} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.ui.color["ink-3"]}
      onSubmitEditing={onSubmit} autoFocus={autoFocus} returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="never"
      selectionColor={theme.ui.color.accent} accessibilityRole="search"
      style={[styles.input, { fontFamily: fonts ? faces.text : undefined }]} />
    {value ? <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
      <Icon name="close" size={10} tone="bg" />
    </Pressable> : null}
  </View>;
});

const styles = StyleSheet.create((theme) => ({
  field: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["2"],
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: 22,
    backgroundColor: theme.ui.color.fill,
  },
  input: { flex: 1, height: 44, fontSize: theme.ui.type.body.size, color: theme.ui.color.ink, padding: 0 },
  clear: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color["ink-4"] },
}));
