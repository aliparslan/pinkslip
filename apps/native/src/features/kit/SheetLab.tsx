import { useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { Button, Choice, ChoiceLink, Choices, ListGroup, ListItem, SheetBack, Text } from "../../ui";
import { motion, timing } from "../../ui/motion";

/**
 * Dev-only: the filter sheet's step change in several ways, side by side,
 * with made-up choices, so the owner can feel them before one goes into
 * ui/Sheet (2026-10-13). Nothing here saves; tap behind a sheet to close it.
 */
type Variant = "cards" | "stack" | "pushResize" | "push" | "fade";

const VARIANTS: { id: Variant; title: string; detail: string }[] = [
  { id: "cards", title: "Each step its own card", detail: "The new step slides in at its own size" },
  { id: "stack", title: "Second sheet on top", detail: "The menu shrinks back and the step rises over it" },
  { id: "pushResize", title: "Push and resize", detail: "One sheet that changes height as the step slides in" },
  { id: "push", title: "Push, same height", detail: "The iOS standard: the sheet keeps the menu's height" },
  { id: "fade", title: "Cross-fade", detail: "What's on your phone now" },
];

type Step = "menu" | "stage" | "roles" | "visa";
type Choosing = Exclude<Step, "menu">;

const CHOICES: Record<Choosing, { title: string; options: string[]; picked: number[] }> = {
  stage: { title: "Career stage", options: ["Internships", "New grad", "Early career", "Mid-career"], picked: [1, 2] },
  roles: {
    title: "Roles",
    options: ["SWE", "Frontend", "Backend", "Fullstack", "Mobile", "Data", "AI / ML", "Research", "Infrastructure & SRE", "Security", "Product"],
    picked: [0, 1, 2, 3],
  },
  visa: { title: "Visa sponsorship", options: ["Not needed", "I'll need sponsorship"], picked: [0] },
};

const INSET = 8;
const OPEN = timing(motion.sheet.open);
const CLOSE = timing(motion.sheet.close);
const RESIZE = timing(motion.sheet.resize);
const FADE_IN = timing(motion.sheet.stepIn);
const FADE_OUT = timing(motion.sheet.stepOut);
/** The pushes run 400ms on the drawer curve, as Ionic does for iOS pages. */
const PUSH = { duration: 400, easing: Easing.bezier(0.32, 0.72, 0, 1) };

export function SheetLab() {
  const [open, setOpen] = useState<Variant | null>(null);
  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <ListGroup footer="Each opens a copy of Your search with made-up choices. Try Career stage, Roles (long) and Visa (short).">
      {VARIANTS.map((variant) => <ListItem key={variant.id} title={variant.title} detail={variant.detail} accessory="chevron"
        onPress={() => setOpen(variant.id)} />)}
    </ListGroup>
    {open ? <LabSheet variant={open} onClosed={() => setOpen(null)} /> : null}
  </ScrollView>;
}

function LabSheet({ variant, onClosed }: { variant: Variant; onClosed: () => void }) {
  const { height: screen, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxHeight = screen - insets.top - INSET;
  const [step, setStep] = useState<Step>("menu");
  const [picked, setPicked] = useState(() => Object.fromEntries(
    (Object.keys(CHOICES) as Choosing[]).map((key) => [key, CHOICES[key].picked]),
  ) as Record<Choosing, number[]>);
  const [menuHeight, setMenuHeight] = useState(0);
  const rise = useSharedValue(screen);
  const shade = useSharedValue(0);
  const cardHeight = useSharedValue(0);
  const back = useSharedValue(0);
  const opened = useRef(false);

  // The sheet rises once the menu has a height; later sizes ease per variant.
  const sized = (height: number, isMenu: boolean) => {
    if (isMenu) setMenuHeight(height);
    if (!opened.current) {
      opened.current = true;
      cardHeight.value = height;
      rise.value = height + INSET;
      rise.value = withTiming(0, OPEN);
      shade.value = withTiming(1, OPEN);
      return;
    }
    if (variant === "fade") cardHeight.value = withTiming(height, RESIZE);
    if (variant === "pushResize") cardHeight.value = withTiming(height, PUSH);
  };
  const close = () => {
    shade.value = withTiming(0, CLOSE);
    rise.value = withTiming(screen, CLOSE, (done) => {
      if (done) scheduleOnRN(onClosed);
    });
  };
  const go = (next: Step) => {
    if (variant === "stack") back.value = withTiming(next === "menu" ? 0 : 1, PUSH);
    setStep(next);
  };

  const scrim = useAnimatedStyle(() => ({ opacity: shade.value }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value }] }));
  const card = useAnimatedStyle(() => ({ height: cardHeight.value }));
  const shrink = useAnimatedStyle(() => ({
    transform: [{ translateY: -12 * back.value }, { scale: 1 - 0.07 * back.value }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: 0.12 * back.value }));

  const menu = <Menu onOpen={go} />;
  const choice = step === "menu" ? null
    : <ChoicePage step={step} picked={picked[step]} fill={variant === "push"}
      onPick={(index) => setPicked((current) => ({ ...current, [step]: toggle(current[step], index, step) }))} onBack={() => go("menu")} />;
  const first = !opened.current;

  let body: ReactNode;
  if (variant === "cards") {
    // No shared card: each step is its own card, bottom-aligned, and slides.
    body = <View pointerEvents="box-none" style={[styles.stage, { height: maxHeight }]}>
      {step === "menu"
        ? <Animated.View key="menu" entering={first ? undefined : arriving(-1, width)} exiting={leaving(-1, width)}
          onLayout={(event: LayoutChangeEvent) => sized(event.nativeEvent.layout.height, true)} style={[styles.page, styles.ownCard, { maxHeight }]}>
          <Grabber />{menu}
        </Animated.View>
        : <Animated.View key={step} entering={arriving(1, width)} exiting={leaving(1, width)} style={[styles.page, styles.ownCard, { maxHeight }]}>
          <Grabber />{choice}
        </Animated.View>}
    </View>;
  } else if (variant === "stack") {
    // The menu stays put and shrinks back; the step is a second card on top.
    body = <View pointerEvents="box-none" style={[styles.stage, { height: maxHeight }]}>
      <Animated.View onLayout={(event: LayoutChangeEvent) => sized(event.nativeEvent.layout.height, true)}
        style={[styles.page, styles.ownCard, styles.fromTop, { maxHeight }, shrink]}>
        <Grabber />{menu}
        <Animated.View pointerEvents="none" style={[styles.dim, dim]} />
      </Animated.View>
      {step === "menu" ? null
        : <Animated.View key={step} entering={rising(screen)} exiting={falling(screen)} style={[styles.page, styles.ownCard, { maxHeight: maxHeight - 28 }]}>
          <Grabber />{choice}
        </Animated.View>}
    </View>;
  } else {
    // One card whose height follows the step (or stays, for "push").
    const slide = variant !== "fade";
    const enter = (side: 1 | -1) => (slide ? arriving(side, width) : fadingIn);
    const exit = (side: 1 | -1) => (slide ? leaving(side, width) : fadingOut);
    body = <Animated.View style={[styles.sharedCard, card]}>
      <View pointerEvents="box-none" style={[styles.stage, styles.inCard, { height: maxHeight }]}>
        {step === "menu"
          ? <Animated.View key="menu" entering={first ? undefined : enter(-1)} exiting={exit(-1)}
            onLayout={(event: LayoutChangeEvent) => sized(event.nativeEvent.layout.height, true)} style={[styles.page, { maxHeight }]}>
            {menu}
          </Animated.View>
          : <Animated.View key={step} entering={enter(1)} exiting={exit(1)}
            onLayout={variant === "push" ? undefined : (event: LayoutChangeEvent) => sized(event.nativeEvent.layout.height, false)}
            style={[styles.page, variant === "push" ? { height: menuHeight } : { maxHeight }]}>
            {choice}
          </Animated.View>}
      </View>
      <Grabber />
    </Animated.View>;
  }

  return <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
    <View style={styles.fill}>
      <Animated.View style={[styles.scrim, scrim]}>
        <Pressable style={styles.fill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[styles.fill, lift]}>{body}</Animated.View>
    </View>
  </Modal>;
}

function Menu({ onOpen }: { onOpen: (step: Step) => void }) {
  return <>
    <Text role="title1" accessibilityRole="header">Your search</Text>
    <Choices>
      <ChoiceLink title="Career stage" value="New grad, Early" onPress={() => onOpen("stage")} />
      <ChoiceLink title="Pay from" value="Soon" />
      <ChoiceLink title="Roles" value="SWE, Frontend +2" onPress={() => onOpen("roles")} />
      <ChoiceLink title="Visa sponsorship" value="Not needed" onPress={() => onOpen("visa")} />
    </Choices>
    <Button variant="primary" fullWidth disabled>Save search</Button>
  </>;
}

function ChoicePage({ step, picked, fill, onPick, onBack }: {
  step: Choosing; picked: number[]; fill: boolean; onPick: (index: number) => void; onBack: () => void;
}) {
  const choice = CHOICES[step];
  return <>
    <Text role="title1" accessibilityRole="header">{choice.title}</Text>
    <ScrollView style={fill ? styles.fillList : styles.shrink} contentContainerStyle={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
      <Choices>
        {choice.options.map((option, index) => <Choice key={option} title={option} multiple={step !== "visa"}
          selected={picked.includes(index)} onPress={() => onPick(index)} />)}
      </Choices>
    </ScrollView>
    <View style={styles.actions}>
      <SheetBack onPress={onBack} />
      <View style={styles.grow}><Button fullWidth onPress={onBack}>Done</Button></View>
    </View>
  </>;
}

function Grabber() {
  return <View pointerEvents="none" style={styles.grabber} />;
}

function toggle(current: number[], index: number, step: Choosing) {
  if (step === "visa") return [index];
  return current.includes(index) ? current.filter((value) => value !== index) : [...current, index];
}

function arriving(from: 1 | -1, width: number) {
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateX: from * width }] },
      animations: { transform: [{ translateX: withTiming(0, PUSH) }] },
    };
  };
}

function leaving(to: 1 | -1, width: number) {
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateX: 0 }] },
      animations: { transform: [{ translateX: withTiming(to * width, PUSH) }] },
    };
  };
}

function rising(distance: number) {
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateY: distance }] },
      animations: { transform: [{ translateY: withTiming(0, PUSH) }] },
    };
  };
}

function falling(distance: number) {
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateY: 0 }] },
      animations: { transform: [{ translateY: withTiming(distance, PUSH) }] },
    };
  };
}

function fadingIn() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: motion.sheet.stepScale }] },
    animations: { opacity: withTiming(1, FADE_IN), transform: [{ scale: withTiming(1, FADE_IN) }] },
  };
}

function fadingOut() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: { opacity: withTiming(0, FADE_OUT), transform: [{ scale: withTiming(motion.sheet.stepScale, FADE_OUT) }] },
  };
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color["screen-grouped"] },
  content: { paddingVertical: theme.ui.space["6"] },
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.ui.color.scrim },
  stage: { position: "absolute", left: INSET, right: INSET, bottom: INSET },
  inCard: { left: 0, right: 0, bottom: 0 },
  sharedCard: {
    position: "absolute",
    left: INSET,
    right: INSET,
    bottom: INSET,
    borderRadius: 40,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.ui.color["bg-elev"],
    boxShadow: theme.ui.shadow.pill,
  },
  page: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.ui.space["5"],
    paddingTop: 24,
    paddingHorizontal: theme.ui.space["5"],
    paddingBottom: theme.ui.space["5"],
  },
  ownCard: {
    borderRadius: 40,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.ui.color["bg-elev"],
    boxShadow: theme.ui.shadow.pill,
  },
  /** The menu shrinks toward its top edge, so it peeks out above the step. */
  fromTop: { transformOrigin: "top" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.ui.color.ink },
  grabber: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.ui.color["ink-4"],
  },
  shrink: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  fillList: { flex: 1, marginHorizontal: -theme.ui.space["5"] },
  grow: { flex: 1 },
  list: { paddingHorizontal: theme.ui.space["5"] },
  actions: { flexDirection: "row", gap: theme.ui.space["3"] },
}));
