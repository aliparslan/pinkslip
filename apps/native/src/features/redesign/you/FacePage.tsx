import { useSession } from "@pinkslip/data";
import { useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale } from "../../../kit";
import { haptics } from "../../../platform/haptics";
import { Button, Face, FACE_PARTS, faceOptionLabel, randomFace, Text, type FacePart, type FaceSpec } from "../../../ui";
import { faceOwner, setFace, useFace } from "./face";
import { YouPage } from "./Page";

const SECTIONS: { part: FacePart; title: string }[] = [
  { part: "color", title: "Color" },
  { part: "eyes", title: "Eyes" },
  { part: "brows", title: "Eyebrows" },
  { part: "mouth", title: "Mouth" },
  { part: "glasses", title: "Glasses" },
  { part: "extra", title: "Freckles and moustache" },
];

const COLUMNS = 5;
/** The ring around the chosen option, and the air inside it. */
const RING = 2;
const RING_GAP = 2;

/**
 * You → your face (owner, 2026-11-08, Paper "Build your face"; hair and hats
 * come later). Each option is your own face with that one part changed, and
 * a tap saves it.
 */
export function FacePage() {
  const me = useSession().data?.me;
  const owner = faceOwner(me?.account?.email, me?.user?.name);
  const face = useFace(owner);
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const gap = theme.ui.space["3"];
  const tile = Math.floor((width - theme.ui.size.gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  const choose = (next: FaceSpec) => {
    haptics.tick();
    setFace(owner, next);
  };
  return <YouPage title="Your face">
    <View style={styles.hero}>
      <Face spec={face} size={128} />
      <View><Button size="small" onPress={() => choose(randomFace())}>Shuffle</Button></View>
    </View>
    {SECTIONS.map(({ part, title }) => <View key={part} style={styles.section}>
      <View accessible accessibilityRole="header"><Text role="section">{title}</Text></View>
      <View style={styles.grid}>
        {(FACE_PARTS[part] as readonly string[]).map((option) => {
          const selected = face[part] === option;
          return <PressableScale key={option} onPress={() => choose({ ...face, [part]: option } as FaceSpec)} accessibilityRole="radio"
            accessibilityLabel={`${title}, ${faceOptionLabel(option)}`} accessibilityState={{ selected }}
            contentStyle={[styles.tile, { width: tile, height: tile }, selected && styles.tileOn]}>
            <Face spec={{ ...face, [part]: option } as FaceSpec} size={tile - (RING + RING_GAP) * 2} focus={part} />
          </PressableScale>;
        })}
      </View>
    </View>)}
  </YouPage>;
}

const styles = StyleSheet.create((theme) => ({
  hero: { alignItems: "center", gap: theme.ui.space["4"], paddingTop: theme.ui.space["2"] },
  section: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.ui.space["3"] },
  tile: { alignItems: "center", justifyContent: "center", borderRadius: theme.ui.radius.full, borderWidth: RING, borderColor: "transparent" },
  tileOn: { borderColor: theme.ui.color.ink },
}));
