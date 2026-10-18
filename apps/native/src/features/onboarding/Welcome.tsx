import { useApi, usePreferences } from "@pinkslip/data";
import { normalizeSearchProfile, ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { useTabBarStepsAside } from "../../ui";
import { motion, spring } from "../../ui/motion";
import { screenCornerRadius } from "../../ui/screen-corners";
import { Handles } from "./Handles";
import { Hook, settleTime, type ButtonRect } from "./Hook";
import { Questions } from "./Questions";

const { bloom: BLOOM } = motion.onboarding;

type Stage = "hook" | "handles" | "questions";

export interface WelcomeProps {
  /** The answers go into your search (not in the kit's plain replay). */
  saves: boolean;
  /** A new install's own run, which sends the onboarding events. */
  counts: boolean;
  onDone: () => void;
  /** I have an account: onboarding ends and sign-in opens. */
  onAccount: () => void;
}

/**
 * Onboarding (Paper "Onboarding · the build · Oct 18"; picked Oct 14, "A ·
 * Lights on"): the hook, page two grown out of its button, then the three
 * questions in a sheet over Jobs, which fills in behind them. It ends on
 * Jobs with nothing left to fill in; the account is asked for later, when
 * it matters. The tab bar steps aside until it's done.
 */
export function Welcome({ saves, counts, onDone, onAccount }: WelcomeProps) {
  const api = useApi();
  const preferences = usePreferences();
  const [stage, setStage] = useState<Stage>("hook");
  const [bloom, setBloom] = useState<ButtonRect | null>(null);
  const [pageGone, setPageGone] = useState(false);
  useTabBarStepsAside(true);

  const leave = (button: ButtonRect) => {
    if (counts) {
      void api.interactions.event({ event_name: "onboarding_started", entity_type: "onboarding", properties: { onboarding_version: ONBOARDING_VERSION } })
        .catch(() => undefined);
    }
    setBloom(button);
  };

  const saved = preferences.data ? normalizeSearchProfile(preferences.data.search_profile) : null;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {stage === "hook" ? <Hook onLeave={leave} onAccount={onAccount} /> : null}
    {stage !== "hook" && !pageGone ? <Handles onReady={() => setStage("questions")} onGone={() => setPageGone(true)} /> : null}
    {bloom ? <Bloom from={bloom} onCovered={() => setStage("handles")} onGone={() => setBloom(null)} /> : null}
    {saved ? <Questions open={stage === "questions"} saved={saved} saves={saves} counts={counts} onDone={onDone} /> : null}
  </View>;
}

/** Leave it to Pinkslip grows to fill the screen, paling from pink to the
 * page, and page two takes over underneath it as it fades. */
function Bloom({ from, onCovered, onGone }: { from: ButtonRect; onCovered: () => void; onGone: () => void }) {
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const grow = useSharedValue(0);
  const pale = useSharedValue(0);
  const fade = useSharedValue(1);
  const pink = theme.ui.color["accent-fill"];
  const page = theme.ui.color.bg;
  const corner = screenCornerRadius();

  useEffect(() => {
    grow.value = withSpring(1, spring(BLOOM));
    pale.value = withDelay(60, withTiming(1, { duration: BLOOM.pale, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    const handoff = setTimeout(() => {
      onCovered();
      fade.value = withTiming(0, { duration: 160 }, (done) => {
        if (done) scheduleOnRN(onGone);
      });
    }, settleTime(BLOOM) * BLOOM.handoff);
    return () => clearTimeout(handoff);
    // Plays once, from the button it was given.
  }, []);

  const style = useAnimatedStyle(() => {
    const g = grow.value;
    return {
      left: from.x * (1 - g),
      top: from.y * (1 - g),
      width: from.width + (width - from.width) * g,
      height: from.height + (height - from.height) * g,
      borderRadius: from.height / 2 + (corner - from.height / 2) * g,
      backgroundColor: interpolateColor(pale.value, [0, 1], [pink, page]),
      opacity: fade.value,
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.bloom, style]} />;
}

const styles = StyleSheet.create({
  bloom: { position: "absolute" },
});
