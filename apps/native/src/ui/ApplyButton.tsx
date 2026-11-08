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

import type { ApplyState } from "./apply-state";

export type { ApplyState };

export interface ApplyButtonProps {
  state: ApplyState;
  saved: boolean;
  onSave: () => void;
  onPress?: () => void;
  /** Apply for me's caret: apply yourself instead. */
  onApplyMyself?: () => void;
  /** Apply for me's caret: fill everything but stop short of Submit. */
  onCheckFirst?: () => void;
}

/** Pink when the next move is yours; gray while Pinkslip is doing it or it's done. */
const PINK: ReadonlySet<ApplyState["kind"]> = new Set(["applyForMe", "needsYou", "checked", "code", "finishOnPhone"]);
const isPink = (state: ApplyState) => (state.kind === "apply" && !state.closed) || PINK.has(state.kind);
/** Pinkslip's browser is on it, so the button carries the bot mark and fills. */
const WORKING: ReadonlySet<ApplyState["kind"]> = new Set(["applyForMe", "queued", "opening", "applying", "sending"]);
/** Save goes once a job is queued or applied: it's in Tracker by then. */
const hasSave = (state: ApplyState) => state.kind === "apply" || state.kind === "applyForMe";

function words(state: ApplyState): string {
  switch (state.kind) {
    case "apply": return state.closed ? "Listing closed" : "Apply";
    case "applyForMe": return "Apply for me";
    case "queued": return state.ahead > 0 ? `Queued · ${state.ahead} ahead` : "Queued · next";
    case "opening": return "Applying · opening the form";
    case "applying": return `Applying · ${state.filled} of ${state.of} filled`;
    case "sending": return `Applying · sending to ${state.company}`;
    case "needsYou": return `Answer ${state.questions} question${state.questions === 1 ? "" : "s"} to finish`;
    case "checked": return "Review and send";
    case "code": return "Enter Greenhouse's code";
    // Pinkslip's browser met a captcha or something only you can do: you
    // finish the form here (owner, 2026-11-08: "on your phone" read as a
    // place, not as "yourself").
    case "finishOnPhone": return "Finish it yourself";
    case "didntSend": return "Didn't send · Try again";
    case "sent": return `Sent · waiting for ${state.company}`;
    case "applied": return state.date ? `Applied ${state.date}` : "Applied";
    case "stage": return `${state.label} · View in Tracker`;
  }
}

/** How much of the button is filled while Pinkslip's browser works: a sliver
 * while the form opens, field by field, then all of it while it sends. */
function filledShare(state: ApplyState): number | null {
  switch (state.kind) {
    case "opening": return 0.04;
    case "applying": return state.filled / Math.max(state.of, 1);
    case "sending": return 1;
    default: return null;
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
export function ApplyButton({ state, saved, onSave, onPress, onApplyMyself, onCheckFirst }: ApplyButtonProps) {
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
  const share = filledShare(state);
  const progress = useSharedValue(share ?? 0);
  useEffect(() => {
    progress.value = withTiming(share ?? 0, { duration: 300 });
  }, [share, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const icon = WORKING.has(state.kind)
    ? <Icon name="autoApply" size={20} tone={mark} />
    : state.kind === "didntSend" ? <Icon name="refresh" size={20} tone="ink-2" />
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
      {share !== null ? <Animated.View pointerEvents="none" style={[styles.fill, fill]} /> : null}
      <PressableScale accessibilityRole="button" accessibilityLabel={label} disabled={!onPress || (state.kind === "apply" && state.closed)}
        onPress={onPress} style={styles.main} contentStyle={styles.press}>
        {content}
      </PressableScale>
      {state.kind === "applyForMe" && onApplyMyself ? <>
        <View style={[styles.divider, { backgroundColor: theme.ui.color["accent-ink"] }]} />
        <GlyphMenu items={[
          { id: "me", title: "Apply for me", glyph: "bot", on: true, onSelect: () => onPress?.() },
          // Paper "Send screens · Oct 24", S1: everything but Submit.
          ...(onCheckFirst ? [{ id: "check", title: "Check first", glyph: "preview" as const, onSelect: onCheckFirst }] : []),
          { id: "myself", title: "Apply myself", glyph: "open", onSelect: onApplyMyself },
        ]}>
          <View style={styles.caret} accessible accessibilityRole="button" accessibilityLabel="More ways to apply">
            <Icon name="down" size={16} tone="accent-ink" />
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
  // A deeper gray over the gray, as the live bar fills: pink stays for the
  // moves that are yours (owner, 2026-10-29). `pill` is see-through in both
  // modes, where dark's `fill` is solid and would vanish on itself.
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: theme.ui.color.pill },
  // Paper: a faint rule between Apply for me and its caret.
  divider: { width: StyleSheet.hairlineWidth * 2, height: 24, opacity: 0.35 },
  caret: { width: 48, height: theme.ui.size.button, alignItems: "center", justifyContent: "center" },
}));
