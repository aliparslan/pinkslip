import { locationLabels } from "@pinkslip/core/feed-criteria";
import { NO_ROLE_PREFERENCE, roleChips, visibleRoles, type Profile } from "@pinkslip/core/profile-fields";
import { queryKeys, useApi, useUpdatePreferences } from "@pinkslip/data";
import { LOCATION_OPTIONS, ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { useReducedMotion, useSharedValue, withSpring, withTiming, type EntryExitAnimationFunction, type SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { Button, Chip, SheetBack, SheetHeader, SheetModal, SheetScroll, SheetStep, Text, useSheet, useSheetGuard } from "../../ui";
import { motion, spring } from "../../ui/motion";
import { stageName, STAGES_IN_ORDER, wantsRemote } from "../redesign/search-draft";
import { answeredSearch, canContinue, flipRemote, pickPlace, pickRole, pickStage, QUESTIONS, type Question } from "./answers";

const { step: STEP } = motion.onboarding;
const STEP_SPRING = spring(STEP);

const TITLES: Record<Question, string> = {
  stage: "Where are you in your career?",
  roles: "What do you want to do?",
  where: "Where do you want to work?",
};

/** How long the real Jobs gets to load the saved search before the sheet
 * goes anyway. */
const HANDOVER_MS = 2500;

export interface QuestionsProps {
  open: boolean;
  /** The search as it's saved now; the answers go into it. */
  saved: Profile;
  draft: Profile;
  change: (patch: Partial<Profile>) => void;
  index: number;
  setIndex: (index: number) => void;
  /** The answers go into your search (not in the kit's plain replay). */
  saves: boolean;
  /** A new install's own run, which sends the completed event. */
  counts: boolean;
  onDone: () => void;
}

/**
 * The three questions (Paper "Onboarding · the build · Oct 18", 3 to 3c):
 * career stage, roles and where as chips, in a short sheet over the feed
 * that leaves it bright and in view (owner: that's the point of a sheet).
 * The feed behind answers every tap at once (PreviewFeed). From one
 * question to the next the words slide and fade as the sheet eases to its
 * new height (the Onboarding Motion Lab). The answers are saved once, at
 * the end, and the sheet waits for Jobs to load them before it goes. It
 * can't be swiped away: three taps and it's finished.
 */
export function Questions({ open, onDone, ...props }: QuestionsProps) {
  return <SheetModal open={open} onClosed={onDone} dim={false}>
    <Steps {...props} />
  </SheetModal>;
}

function Steps({ saved, draft, change, index, setIndex, saves, counts }: Omit<QuestionsProps, "open" | "onDone">) {
  const sheet = useSheet();
  const api = useApi();
  const queryClient = useQueryClient();
  const update = useUpdatePreferences();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  // Which way the words move: read as one question leaves and the next comes.
  const direction = useSharedValue(1);
  const [finishing, setFinishing] = useState(false);
  useSheetGuard(true, () => undefined);

  const question = QUESTIONS[index]!;
  const last = index === QUESTIONS.length - 1;
  const pick = (patch: Partial<Profile>) => {
    haptics.tick();
    change(patch);
  };
  const go = (to: number) => {
    direction.value = to > index ? 1 : -1;
    setIndex(to);
  };

  const finish = async () => {
    if (saves) {
      setFinishing(true);
      try {
        await update.mutateAsync({ search_profile: answeredSearch(saved, draft, new Date()) });
        // Jobs behind takes over from the preview once it has the new search.
        await Promise.race([
          queryClient.refetchQueries({ queryKey: queryKeys.personal.jobsRoot, type: "active" }),
          new Promise((resolve) => setTimeout(resolve, HANDOVER_MS)),
        ]);
      } catch {
        setFinishing(false);
        toast.error("Couldn't save that. Try again.");
        return;
      }
    }
    if (counts) {
      void api.interactions.event({ event_name: "onboarding_completed", entity_type: "onboarding", properties: { onboarding_version: ONBOARDING_VERSION } })
        .catch(() => undefined);
    }
    haptics.success();
    sheet.close();
  };

  const done = <Button variant="primary" fullWidth disabled={!canContinue(question, draft)} pending={finishing}
    onPress={() => (last ? void finish() : go(index + 1))}>
    {last ? "Show my jobs" : "Continue"}
  </Button>;

  return <SheetStep id="questions" grabber={false}>
    <Animated.View key={question} style={styles.question}
      entering={reduced ? undefined : arrive(direction, width)} exiting={reduced ? undefined : depart(direction, width)}>
      <View style={styles.header}>
        <Text role="subhead" tone="ink-3">{`${index + 1} of ${QUESTIONS.length}`}</Text>
        <SheetHeader title={TITLES[question]} />
      </View>
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.chips}>
        <Answers question={question} draft={draft} pick={pick} />
      </SheetScroll>
    </Animated.View>
    {index === 0 ? done : <View style={styles.actions}>
      <SheetBack onPress={() => go(index - 1)} />
      <View style={styles.flex}>{done}</View>
    </View>}
  </SheetStep>;
}

/** The next question's words come in from the side it's heading from... */
function arrive(direction: SharedValue<number>, width: number): EntryExitAnimationFunction {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateX: direction.value * width * STEP.shift }] },
      animations: { opacity: withTiming(1, { duration: 220 }), transform: [{ translateX: withSpring(0, STEP_SPRING) }] },
    };
  };
}

/** ...as the last one's slide the other way and fade. */
function depart(direction: SharedValue<number>, width: number): EntryExitAnimationFunction {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: {
        opacity: withTiming(0, { duration: 180 }),
        transform: [{ translateX: withSpring(-direction.value * width * STEP.shift, STEP_SPRING) }],
      },
    };
  };
}

/** One question's chips: the kit's 32pt Chip, ink when on, with a tick. */
function Answers({ question, draft, pick }: { question: Question; draft: Profile; pick: (patch: Partial<Profile>) => void }) {
  if (question === "stage") {
    return <>{STAGES_IN_ORDER.map((id) => <Chip key={id} label={stageName(id)} selected={draft.target_levels.includes(id)}
      onPress={() => pick(pickStage(draft, id))} />)}</>;
  }
  if (question === "roles") {
    const chips = roleChips(draft);
    return <>
      <Chip label="Any role" selected={chips.includes(NO_ROLE_PREFERENCE)} onPress={() => pick(pickRole(draft, NO_ROLE_PREFERENCE))} />
      {visibleRoles.map((option) => <Chip key={option.id} label={option.label} selected={chips.includes(option.id)}
        onPress={() => pick(pickRole(draft, option.id))} />)}
    </>;
  }
  const anywhere = draft.relocation_willing || draft.location_ids.length === 0;
  return <>
    <Chip label="Remote" selected={wantsRemote(draft)} onPress={() => pick(flipRemote(draft))} />
    <Chip label="Anywhere in the US" selected={anywhere} onPress={() => pick(pickPlace(draft, "anywhere"))} />
    {LOCATION_OPTIONS.map((option) => <Chip key={option.id} label={locationLabels[option.id]}
      selected={!anywhere && draft.location_ids.includes(option.id)} onPress={() => pick(pickPlace(draft, option.id))} />)}
  </>;
}

const styles = StyleSheet.create((theme) => ({
  question: { gap: theme.ui.space["5"], flexShrink: 1 },
  header: { gap: 2 },
  /** The chips size the step, and scroll if larger text makes them taller than the screen. */
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["1"] },
  actions: { flexDirection: "row", gap: theme.ui.space["3"] },
  flex: { flex: 1 },
}));
