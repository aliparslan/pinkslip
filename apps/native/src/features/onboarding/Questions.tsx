import { locationLabels } from "@pinkslip/core/feed-criteria";
import { NO_ROLE_PREFERENCE, roleChips, visibleRoles, type Profile } from "@pinkslip/core/profile-fields";
import { useApi, useUpdatePreferences } from "@pinkslip/data";
import { LOCATION_OPTIONS, normalizeSearchProfile, ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { Button, Chip, SheetBack, SheetHeader, SheetModal, SheetScroll, SheetStep, Text, useSheet, useSheetGuard } from "../../ui";
import { stageName, STAGES_IN_ORDER, wantsRemote } from "../redesign/search-draft";
import { canContinue, flipRemote, pickPlace, pickRole, pickStage, QUESTIONS, unanswered, withAnswer, type Question } from "./answers";

const TITLES: Record<Question, string> = {
  stage: "Where are you in your career?",
  roles: "What do you want to do?",
  where: "Where do you want to work?",
};

/** How long after the last tap an answer is saved, so the feed behind
 * catches up without a save for every tap. */
const SETTLE_MS = 400;

export interface QuestionsProps {
  open: boolean;
  /** The search as it's saved now; the answers go into it. */
  saved: Profile;
  /** The answers go into your search (not in the kit's plain replay). */
  saves: boolean;
  /** A new install's own run, which sends the completed event. */
  counts: boolean;
  onDone: () => void;
}

/**
 * The three questions (Paper "Onboarding · the build · Oct 18", 3 to 3c):
 * career stage, roles and where as chips, one step each, in a short sheet
 * over Jobs that leaves the feed bright and in view behind it (owner: that's
 * the point of a sheet). Each answer is saved a moment after a tap, so the
 * jobs behind change as you pick; the last marks onboarding done. The sheet
 * can't be swiped away: three taps and it's finished.
 */
export function Questions({ open, saved, saves, counts, onDone }: QuestionsProps) {
  return <SheetModal open={open} onClosed={onDone} dim={false}>
    <Steps saved={saved} saves={saves} counts={counts} />
  </SheetModal>;
}

type Move = "forward" | "back";

function Steps({ saved: initial, saves, counts }: { saved: Profile; saves: boolean; counts: boolean }) {
  const sheet = useSheet();
  const api = useApi();
  const update = useUpdatePreferences();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => unanswered(initial));
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  // A step leaves the way the next one is coming from, so the step in front
  // is drawn for the move before it changes (see `inner` below).
  const [leaving, setLeaving] = useState<{ move: Move; to: number } | null>(null);
  const [arrived, setArrived] = useState<Move>("forward");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turns = useRef(0);
  useSheetGuard(true, () => undefined);

  useEffect(() => {
    if (!leaving) return;
    setArrived(leaving.move);
    setIndex(leaving.to);
    setLeaving(null);
  }, [leaving]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const question = QUESTIONS[index]!;
  const last = index === QUESTIONS.length - 1;

  /** Saves the search with this answer in; only the newest save's reply counts. */
  const save = async (answered: Profile) => {
    const turn = ++turns.current;
    const result = await update.mutateAsync({ search_profile: answered });
    if (turn === turns.current) setSaved(normalizeSearchProfile(result.search_profile));
  };

  const change = (patch: Partial<Profile>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!saves || !canContinue(question, next)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(withAnswer(saved, question, next, new Date())).catch(() => undefined), SETTLE_MS);
  };

  const next = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (saves) {
      setFinishing(true);
      try {
        await save(withAnswer(saved, question, draft, new Date()));
      } catch {
        toast.error("Couldn't save that. Try again.");
        return;
      } finally {
        setFinishing(false);
      }
    }
    if (!last) {
      setLeaving({ move: "forward", to: index + 1 });
      return;
    }
    if (counts) {
      void api.interactions.event({ event_name: "onboarding_completed", entity_type: "onboarding", properties: { onboarding_version: ONBOARDING_VERSION } })
        .catch(() => undefined);
    }
    haptics.success();
    sheet.close();
  };

  // Arriving forward it came in from the right; about to go forward it
  // leaves to the left, and back the other way round.
  const inner = leaving ? leaving.move === "back" : arrived === "forward";
  const done = <Button variant="primary" fullWidth disabled={!canContinue(question, draft)} pending={finishing} onPress={() => void next()}>
    {last ? "Show my jobs" : "Continue"}
  </Button>;

  return <SheetStep id={question} inner={inner} grabber={false}>
    <View style={styles.header}>
      <Text role="subhead" tone="ink-3">{`${index + 1} of ${QUESTIONS.length}`}</Text>
      <SheetHeader title={TITLES[question]} />
    </View>
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.chips}>
      <Answers question={question} draft={draft} change={change} />
    </SheetScroll>
    {index === 0 ? done : <View style={styles.actions}>
      <SheetBack onPress={() => setLeaving({ move: "back", to: index - 1 })} />
      <View style={styles.flex}>{done}</View>
    </View>}
  </SheetStep>;
}

/** One question's chips: the kit's 32pt Chip, ink when on. */
function Answers({ question, draft, change }: { question: Question; draft: Profile; change: (patch: Partial<Profile>) => void }) {
  if (question === "stage") {
    return <>{STAGES_IN_ORDER.map((id) => <Chip key={id} label={stageName(id)} selected={draft.target_levels.includes(id)}
      onPress={() => change(pickStage(draft, id))} />)}</>;
  }
  if (question === "roles") {
    const chips = roleChips(draft);
    return <>
      <Chip label="Any role" selected={chips.includes(NO_ROLE_PREFERENCE)} onPress={() => change(pickRole(draft, NO_ROLE_PREFERENCE))} />
      {visibleRoles.map((option) => <Chip key={option.id} label={option.label} selected={chips.includes(option.id)}
        onPress={() => change(pickRole(draft, option.id))} />)}
    </>;
  }
  const anywhere = draft.relocation_willing || draft.location_ids.length === 0;
  return <>
    <Chip label="Remote" selected={wantsRemote(draft)} onPress={() => change(flipRemote(draft))} />
    <Chip label="Anywhere in the US" selected={anywhere} onPress={() => change(pickPlace(draft, "anywhere"))} />
    {LOCATION_OPTIONS.map((option) => <Chip key={option.id} label={locationLabels[option.id]}
      selected={!anywhere && draft.location_ids.includes(option.id)} onPress={() => change(pickPlace(draft, option.id))} />)}
  </>;
}

const styles = StyleSheet.create((theme) => ({
  header: { gap: 2 },
  /** The chips size the step, and scroll if larger text makes them taller than the screen. */
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["1"] },
  actions: { flexDirection: "row", gap: theme.ui.space["3"] },
  flex: { flex: 1 },
}));
