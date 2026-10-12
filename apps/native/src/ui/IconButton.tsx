import { StyleSheet } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Icon, type IconName } from "./Icon";

export interface IconButtonProps {
  icon: IconName;
  /** Read by VoiceOver; there is no visible label. */
  label: string;
  onPress?: () => void;
}

/** A 44pt round button on the grey fill (back, share, more, filters). */
export function IconButton({ icon, label, onPress }: IconButtonProps) {
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scale={0.92} contentStyle={styles.root}>
    <Icon name={icon} size={20} weight="medium" />
  </PressableScale>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: theme.ui.size.iconButton,
    height: theme.ui.size.iconButton,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.ui.radius.full,
    backgroundColor: theme.ui.color.fill,
  },
}));
