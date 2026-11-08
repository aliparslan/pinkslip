import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { InputAccessoryView, Keyboard, Pressable, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Icon } from "./Icon";
import { Text } from "./Text";

type Field = RefObject<TextInput | null>;

interface Form {
  id: string;
  add: (field: Field) => () => void;
  focused: () => void;
}

const FormFields = createContext<Form | null>(null);

/** A field's place in the page's form: pass `id` to its input's
 * `inputAccessoryViewID` and call `focused` when it takes focus. */
export function useFormField(field: Field) {
  const form = useContext(FormFields);
  const add = form?.add;
  useEffect(() => add?.(field), [add, field]);
  return form;
}

/** Fields top to bottom as they stand on screen, so rows added later fall
 * where you see them. */
async function onScreen(fields: Iterable<Field>): Promise<Field[]> {
  const placed = await Promise.all([...fields].map((field) => new Promise<{ field: Field; x: number; y: number } | null>((resolve) => {
    if (!field.current) { resolve(null); return; }
    field.current.measureInWindow((x, y) => resolve({ field, x, y }));
  })));
  return placed.filter((item) => item !== null).sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.field);
}

/**
 * iOS's Previous / Next / Done above the keyboard, for a page of fields
 * (owner, 2026-11-08). The arrows go between the page's fields as they
 * stand on screen; they dim at either end. A page with no fields shows
 * nothing.
 */
export function FormKeyboard({ children }: { children: ReactNode }) {
  const id = useId();
  const fields = useRef(new Set<Field>());
  const [count, setCount] = useState(0);
  const [ends, setEnds] = useState({ first: true, last: true });
  const add = useCallback((field: Field) => {
    fields.current.add(field);
    setCount(fields.current.size);
    return () => {
      fields.current.delete(field);
      setCount(fields.current.size);
    };
  }, []);
  const place = useCallback(async () => {
    const ordered = await onScreen(fields.current);
    const current = TextInput.State.currentlyFocusedInput();
    return { ordered, at: ordered.findIndex((field) => field.current === current) };
  }, []);
  const focused = useCallback(() => {
    void place().then(({ ordered, at }) => setEnds({ first: at <= 0, last: at === ordered.length - 1 }));
  }, [place]);
  const go = (step: -1 | 1) => void place().then(({ ordered, at }) => ordered[at + step]?.current?.focus());
  const form = useMemo(() => ({ id, add, focused }), [id, add, focused]);
  return <FormFields.Provider value={form}>
    {children}
    {count > 0 ? <InputAccessoryView nativeID={id}>
      <View style={styles.bar}>
        <Arrow label="Previous field" turn="-90deg" disabled={ends.first} onPress={() => go(-1)} />
        <Arrow label="Next field" turn="90deg" disabled={ends.last} onPress={() => go(1)} />
        <View style={styles.space} />
        <Pressable accessibilityRole="button" onPress={Keyboard.dismiss} hitSlop={8} style={styles.done}>
          <Text weight="medium" tone="accent">Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView> : null}
  </FormFields.Provider>;
}

function Arrow({ label, turn, disabled, onPress }: { label: string; turn: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.arrow, disabled && styles.dimmed]}>
    <View style={{ transform: [{ rotate: turn }] }}><Icon name="disclosure" size={18} tone="ink" /></View>
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    height: theme.ui.size.iconButton, flexDirection: "row", alignItems: "center", paddingHorizontal: theme.ui.space["2"],
    backgroundColor: theme.ui.color.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator,
  },
  arrow: { width: theme.ui.size.iconButton, height: theme.ui.size.iconButton, alignItems: "center", justifyContent: "center" },
  dimmed: { opacity: 0.3 },
  space: { flex: 1 },
  done: { paddingHorizontal: theme.ui.space["3"], height: theme.ui.size.iconButton, justifyContent: "center" },
}));
