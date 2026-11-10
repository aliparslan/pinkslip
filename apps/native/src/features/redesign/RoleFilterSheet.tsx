import { ROLE_OPTIONS, type RoleId } from "@pinkslip/domain/search-profile";
import { StyleSheet } from "react-native-unistyles";
import { Choice, Choices, SheetHeader, SheetModal, SheetScroll, SheetStep } from "../../ui";

export const roleTitle = (id: RoleId) => ROLE_OPTIONS.find((option) => option.id === id)?.label ?? id;

/** The Role chip's drawer, for a search with too many roles for a system
 * dropdown, as Location has. One role or Any; a tap picks it and closes. */
export function RoleFilterSheet({ open, onClosed, options, chosen, onChoose }: {
  open: boolean;
  onClosed: () => void;
  options: readonly RoleId[];
  chosen: RoleId | undefined;
  onChoose: (role: RoleId | undefined) => void;
}) {
  return <SheetModal open={open} onClosed={onClosed}>
    <SheetStep id="role">
      <SheetHeader title="Role" />
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.body}>
        <Choices last>
          <Choice plain title="Any" selected={!chosen} onPress={() => onChoose(undefined)} />
          {options.map((id) => <Choice key={id} plain title={roleTitle(id)} selected={chosen === id} onPress={() => onChoose(id)} />)}
        </Choices>
      </SheetScroll>
    </SheetStep>
  </SheetModal>;
}

const styles = StyleSheet.create((theme) => ({
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  body: { paddingHorizontal: theme.ui.space["5"] },
}));
