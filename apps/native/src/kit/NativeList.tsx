import { Button as SwiftButton, Host, List, RNHostView, SwipeActions } from "@expo/ui/swift-ui";
import {
  listRowBackground, listRowInsets, listRowSeparator, listStyle, onAppear, refreshable,
  scrollContentBackground, tint,
} from "@expo/ui/swift-ui/modifiers";
import { createContext, useContext, useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

const rowInsets = listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 });
const ListWidth = createContext(0);

/** A plain SwiftUI List owns scrolling, refresh and native swipe recognition.
 * Its children are NativeListContent or NativeSwipeRow, never nested RN lists. */
export function NativeList({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const { theme } = useUnistyles();
  const [width, setWidth] = useState(0);
  return <View style={{ flex: 1, backgroundColor: theme.colors.bg }}
    onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
    <ListWidth.Provider value={width}>
      <Host style={{ flex: 1 }}
        colorScheme={theme.mode === "light" || theme.mode === "lightContrast" ? "light" : "dark"}>
        <List modifiers={[listStyle("plain"), scrollContentBackground("hidden"), refreshable(onRefresh)]}>
          {width > 0 && children}
        </List>
      </Host>
    </ListWidth.Provider>
  </View>;
}

/** Yoga needs the list's measured width to wrap text before SwiftUI reads the
 * content height. Without it, long titles size the row beyond the screen. */
function NativeRowContent({ children }: { children: ReactElement }) {
  const width = useContext(ListWidth);
  return <RNHostView matchContents><View collapsable={false} style={{ width }}>{children}</View></RNHostView>;
}

/** Bridge existing kit compositions into one self-sizing native list row. */
export function NativeListContent({ children, onVisible }: { children: ReactElement; onVisible?: () => void }) {
  const { theme } = useUnistyles();
  return <SwipeActions modifiers={[rowInsets, listRowBackground(theme.colors.bg), listRowSeparator("hidden"),
    ...(onVisible ? [onAppear(onVisible)] : [])]}>
    <NativeRowContent>{children}</NativeRowContent>
  </SwipeActions>;
}

export interface NativeSwipeAction {
  label: string;
  icon: NonNullable<Parameters<typeof SwiftButton>[0]["systemImage"]>;
  tone: "accent" | "bad" | "neutral";
  run: () => void;
}

/** iOS supplies reveal buttons, full-swipe thresholds, cancellation and motion.
 * Action roles use system swipe colors; custom pastel fills would lose the
 * system's label contrast. Domain actions and Undo belong to the caller. */
export function NativeSwipeRow({ leading, trailing, children }: {
  leading?: NativeSwipeAction | null;
  trailing?: NativeSwipeAction | null;
  children: ReactElement;
}) {
  const { theme } = useUnistyles();
  const action = (value: NativeSwipeAction, edge: "leading" | "trailing") =>
    <SwipeActions.Actions edge={edge} allowsFullSwipe>
      <SwiftButton label={value.label} systemImage={value.icon} onPress={value.run}
        role={value.tone === "bad" ? "destructive" : "default"}
        modifiers={value.tone === "neutral" ? [tint(theme.colors["ink-3"])] : undefined} />
    </SwipeActions.Actions>;
  return <SwipeActions modifiers={[rowInsets, listRowBackground(theme.colors.bg)]}>
    <NativeRowContent>{children}</NativeRowContent>
    {leading && action(leading, "leading")}
    {trailing && action(trailing, "trailing")}
  </SwipeActions>;
}
