import * as Haptics from "expo-haptics";

/** Light feedback for toggles (save), a tick as a drag passes each choice,
 * success for completed actions. */
export const haptics = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  tick: () => void Haptics.selectionAsync().catch(() => undefined),
  /** A short, hard knock: the last hole of a perforation giving. */
  rigid: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
