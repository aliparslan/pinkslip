import { feedParams } from "@pinkslip/core/feed-criteria";
import type { Profile } from "@pinkslip/core/profile-fields";
import { useApi, useFeed, usePreferences, useUpdatePreferences } from "@pinkslip/data";
import { normalizeSearchProfile, ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { useTabBarStepsAside } from "../../ui";
import { motion, spring } from "../../ui/motion";
import { screenCornerRadius } from "../../ui/screen-corners";
import { useFeedCriteria } from "../feed/Feed";
import { everything, unanswered } from "./answers";
import { Handles } from "./Handles";
import { Hook, settleTime, type ButtonRect } from "./Hook";
import { PreviewFeed } from "./PreviewFeed";
import { Questions } from "./Questions";

const { bloom: BLOOM } = motion.onboarding;

/** Jobs fetched while the hook plays, for the feed behind the questions to
 * narrow on the phone: the newest first, enough to fill it for any answer. */
const POOL = "400";

/** Once the rows have moved to Jobs' own list, how long they get to land
 * before the sheet goes. */
const SETTLE_MS = 450;
/** How long Jobs' list gets to load the saved answers before the sheet goes anyway. */
const HANDOVER_MS = 4000;

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
  const update = useUpdatePreferences();
  const [stage, setStage] = useState<Stage>("hook");
  const [bloom, setBloom] = useState<ButtonRect | null>(null);
  const [pageGone, setPageGone] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [index, setIndex] = useState(0);
  const [handingOver, setHandingOver] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useTabBarStepsAside(true);

  const saved = useMemo(() => (preferences.data ? normalizeSearchProfile(preferences.data.search_profile) : null), [preferences.data]);
  // The questions start unanswered, from the search as it was.
  useEffect(() => {
    if (saved && !draft) setDraft(unanswered(saved));
  }, [saved, draft]);

  // While the hook and page two play, the search is widened to everything
  // (when this run saves) and its newest jobs are fetched, so every tap on a
  // chip narrows the feed at once, with no wait.
  const ready = saved !== null;
  const pool = useQuery({
    queryKey: ["onboarding", "pool", saves],
    queryFn: async () => {
      if (saves && saved) await update.mutateAsync({ search_profile: everything(saved) });
      return (await api.jobs.list({ limit: POOL })).jobs;
    },
    enabled: ready,
    staleTime: Infinity,
    gcTime: 0,
  });

  // Jobs' own list, read as Jobs reads it. Once the answers are saved the
  // feed behind moves to it, so when the sheet and the preview go, the
  // screen underneath already shows the same: you're simply in Jobs.
  const criteria = useFeedCriteria();
  const params = useMemo(() => feedParams(criteria.search, criteria.available, criteria.defaults), [criteria.search, criteria.available, criteria.defaults]);
  const real = useFeed(params, handingOver);
  const loaded = handingOver && real.isSuccess && !real.isFetching;
  const final = useMemo(() => (loaded && real.data ? { jobs: real.data.pages.flatMap((page) => page.jobs), more: real.hasNextPage } : null),
    [loaded, real.data, real.hasNextPage]);
  const waiting = useRef<(() => void) | null>(null);
  const handOver = () => new Promise<void>((resolve) => {
    waiting.current = resolve;
    setHandingOver(true);
    setTimeout(() => {
      if (waiting.current !== resolve) return;
      waiting.current = null;
      resolve();
    }, HANDOVER_MS);
  });
  useEffect(() => {
    const resolve = waiting.current;
    if (!final || !resolve) return;
    waiting.current = null;
    setTimeout(resolve, SETTLE_MS);
  }, [final]);

  const leave = (button: ButtonRect) => {
    if (counts) {
      void api.interactions.event({ event_name: "onboarding_started", entity_type: "onboarding", properties: { onboarding_version: ONBOARDING_VERSION } })
        .catch(() => undefined);
    }
    setBloom(button);
  };

  const change = (patch: Partial<Profile>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const answered = Boolean(draft && (draft.target_levels.length > 0 || index > 0));
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {stage !== "hook" && draft ? <PreviewFeed jobs={pool.data} draft={draft} answered={answered} whereAsked={index >= 2} arriving={arriving}
      final={final} leaving={leaving} onGone={onDone} /> : null}
    {stage === "hook" ? <Hook onLeave={leave} onAccount={onAccount} /> : null}
    {stage !== "hook" && !pageGone
      ? <Handles onLeaving={() => setArriving(true)} onReady={() => setStage("questions")} onGone={() => setPageGone(true)} /> : null}
    {bloom ? <Bloom from={bloom} onCovered={() => setStage("handles")} onGone={() => setBloom(null)} /> : null}
    {saved && draft ? <Questions open={stage === "questions"} saved={saved} draft={draft} change={change} index={index} setIndex={setIndex}
      saves={saves} counts={counts} handOver={handOver} onDone={() => setLeaving(true)} /> : null}
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
