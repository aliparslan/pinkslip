import type { ApplicationStage } from "@pinkslip/core/api";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  FadeIn, FadeOut, interpolateColor, LinearTransition, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Button } from "./Button";
import { GlyphMenu } from "./GlyphMenu";
import { Icon } from "./Icon";
import { motion, spring } from "./motion";
import { StageMark } from "./StageMark";
import { Text } from "./Text";

/** Where an application stands, as the job page's one button shows it. */
export type ApplyState =
  /** You apply yourself, and Pinkslip fills the form (everyone). */
  | { kind: "apply"; closed?: boolean }
  /** Pro: Pinkslip sends it; the caret holds "Apply myself". */
  | { kind: "applyForMe" }
  | { kind: "queued"; ahead: number }
  /** The button fills as the form does. */
  | { kind: "applying"; filled: number; of: number }
  /** Pink again: the thing to do, as a verb. */
  | { kind: "needsYou"; questions: number }
  /** Until the board or the company's email confirms it. */
  | { kind: "sent"; company: string }
  | { kind: "applied"; date: string | null }
  /** Later visits: where it stands, one tap to its page. */
  | { kind: "stage"; stage: ApplicationStage; label: string };

export interface ApplyButtonProps {
  state: ApplyState;
  saved: boolean;
  onSave: () => void;
  onPress?: () => void;
  /** Apply for me's caret: apply yourself instead. */
  onApplyMyself?: () => void;
}

/** Pink when the next move is yours; gray while Pinkslip is doing it or it's done. */
const isPink = (state: ApplyState) => (state.kind === "apply" && !state.closed) || state.kind === "applyForMe" || state.kind === "needsYou";
/** Save goes once a job is queued or applied: it's in Tracker by then. */
const hasSave = (state: ApplyState) => state.kind === "apply" || state.kind === "applyForMe";

function words(state: ApplyState): string {
  switch (state.kind) {
    case "apply": return state.closed ? "Listing closed" : "Apply";
    case "applyForMe": return "Apply for me";
    case "queued": return state.ahead > 0 ? `Queued · ${state.ahead} ahead` : "Queued · next";
    case "applying": return `Applying · ${state.filled} of ${state.of} filled`;
    case "needsYou": return `Answer ${state.questions} question${state.questions === 1 ? "" : "s"} to finish`;
    case "sent": return `Sent · waiting for ${state.company}`;
    case "applied": return state.date ? `Applied ${state.date}` : "Applied";
    case "stage": return `${state.label} · View in Tracker`;
  }
}

const GLIDE = spring(motion.tab.glide);
const FADE_IN = FadeIn.duration(180);
const FADE_OUT = FadeOut.duration(120);

/**
 * The job page's one button (Paper "1 · The Apply button, every state"):
 * it changes state instead of adding buttons. Pink only when the next move
 * is yours (Apply, Apply for me, Answer); everything Pinkslip is doing for
 * you is gray. Save sits beside it until the job is queued or applied.
 * Between states it morphs, so you see it change: the capsule eases to its
 * new width and colour, and the words cross-fade.
 */
export function ApplyButton({ state, saved, onSave, onPress, onApplyMyself }: ApplyButtonProps) {
  const { theme } = useUnistyles();
  const pink = isPink(state);
  const label = words(state);
  const tint = useSharedValue(pink ? 1 : 0);
  useEffect(() => { tint.value = withTiming(pink ? 1 : 0, { duration: 200 }); }, [pink, tint]);
  const capsule = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.value, [0, 1], [theme.ui.color.fill, theme.ui.color["accent-fill"]]),
  }));
  const ink = pink ? "accent-ink" : state.kind === "apply" ? "ink-3" : "ink";
  const mark = pink ? "accent-ink" : "ink-2";
  const progress = useSharedValue(state.kind === "applying" ? state.filled / Math.max(state.of, 1) : 0);
  useEffect(() => {
    progress.value = withTiming(state.kind === "applying" ? state.filled / Math.max(state.of, 1) : 0, { duration: 300 });
  }, [state, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const icon = state.kind === "applyForMe" || state.kind === "queued" || state.kind === "applying"
    ? <Icon name="autoApply" size={20} tone={mark} />
    : state.kind === "sent" ? <Icon name="waiting" size={20} tone="ink-2" />
    : state.kind === "applied" ? <Icon name="done" size={20} tone="good" />
    : state.kind === "stage" ? <StageMark stage={state.stage} size={18} />
    : null;
  const content = <Animated.View key={label} entering={FADE_IN} exiting={FADE_OUT} style={styles.words}>
    {icon}
    <Text weight="medium" tone={ink} lines={1}>{label}</Text>
  </Animated.View>;

  return <View style={styles.row}>
    {hasSave(state) ? <Animated.View entering={FADE_IN} exiting={FADE_OUT}>
      <Button icon={saved ? "saved" : "save"} accessibilityLabel={saved ? "Saved. Tap to remove" : "Save job"} onPress={onSave}>{saved ? "Saved" : "Save"}</Button>
    </Animated.View> : null}
    <Animated.View layout={LinearTransition.springify().mass(GLIDE.mass).stiffness(GLIDE.stiffness).damping(GLIDE.damping)}
      style={[styles.capsule, capsule]}>
      {state.kind === "applying" ? <Animated.View pointerEvents="none" style={[styles.fill, fill]} /> : null}
      <PressableScale accessibilityRole="button" accessibilityLabel={label} disabled={!onPress || (state.kind === "apply" && state.closed)}
        onPress={onPress} style={styles.main} contentStyle={styles.press}>
        {content}
      </PressableScale>
      {state.kind === "applyForMe" && onApplyMyself ? <>
        <View style={[styles.divider, { backgroundColor: theme.ui.color["accent-ink"] }]} />
        <GlyphMenu items={[
          { id: "me", title: "Apply for me", glyph: "bot", on: true, onSelect: () => onPress?.() },
          { id: "myself", title: "Apply myself", glyph: "open", onSelect: onApplyMyself },
        ]}>
          <View style={styles.caret} accessible accessibilityRole="button" accessibilityLabel="More ways to apply">
            <Icon name="split" size={16} tone="accent-ink" />
          </View>
        </GlyphMenu>
      </> : null}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", gap: theme.ui.space["3"] },
  capsule: {
    flex: 1, height: theme.ui.size.button, flexDirection: "row", alignItems: "center",
    borderRadius: theme.ui.radius.full, borderCurve: "continuous", overflow: "hidden",
  },
  main: { flex: 1, alignSelf: "stretch" },
  press: { flex: 1, alignItems: "center", justifyContent: "center" },
  words: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["4"] },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: theme.ui.color["accent-soft"] },
  // Paper: a faint rule between Apply for me and its caret.
  divider: { width: StyleSheet.hairlineWidth * 2, height: 24, opacity: 0.35 },
  caret: { width: 48, height: theme.ui.size.button, alignItems: "center", justifyContent: "center" },
}));
