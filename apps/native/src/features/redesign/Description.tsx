import type { DescriptionBlock, DescriptionRun } from "@pinkslip/core/job-description";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { Text as RNText, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { face, useUiFontsLoaded } from "../../ui";

function Runs({ runs, loaded }: { runs: DescriptionRun[]; loaded: boolean }) {
  return runs.map((run, index) => <RNText key={index}
    style={[run.bold && (loaded ? styles.boldFace : styles.boldWeight), run.italic && styles.italic, run.href && styles.link]}
    onPress={run.href ? () => void WebBrowser.openBrowserAsync(run.href!) : undefined}>{run.text}</RNText>);
}

/** A paragraph you can select part of, highlighted in pink (owner,
 * 2026-10-24). iOS selects in a text view: `selectable` text only offers to
 * copy all of it. A text view can't tell which run a tap landed on, so a
 * paragraph with a link stays text, and its links open. */
/** The app's cap for reading text, so a long word still fits the line. */
const TEXT_CAP = 2;

function Paragraph({ runs, loaded, style }: { runs: DescriptionRun[]; loaded: boolean; style: StyleProp<TextStyle> }) {
  const { theme } = useUnistyles();
  const children: ReactNode = <Runs runs={runs} loaded={loaded} />;
  if (runs.some((run) => run.href)) return <RNText selectable style={style} maxFontSizeMultiplier={TEXT_CAP}>{children}</RNText>;
  return <TextInput editable={false} multiline scrollEnabled={false} maxFontSizeMultiplier={TEXT_CAP} selectionColor={theme.ui.color.accent}
    style={[style, styles.selectable]}>{children}</TextInput>;
}

/** The posting in the redesign's long-text style (17/24), drawn from core's
 * blocks so no posting HTML is ever displayed. */
export function Description({ blocks }: { blocks: DescriptionBlock[] }) {
  const loaded = useUiFontsLoaded();
  const text = loaded ? styles.textFace : null;
  return <View style={styles.root}>
    {blocks.map((block, index) => {
      if (block.kind === "heading") {
        // The first heading leads the section, so it takes no space above it.
        return <RNText key={index} accessibilityRole="header" lineBreakStrategyIOS="standard" maxFontSizeMultiplier={TEXT_CAP}
          style={[styles.heading, index === 0 && styles.leading, loaded ? styles.boldFace : styles.boldWeight]}>
          <Runs runs={block.runs} loaded={loaded} />
        </RNText>;
      }
      if (block.kind === "paragraph") return <Paragraph key={index} runs={block.runs} loaded={loaded} style={[styles.paragraph, text]} />;
      return <View key={index} style={styles.list}>
        {block.items.map((item, itemIndex) => <View key={itemIndex} style={styles.item}>
          <RNText style={[styles.marker, text]} maxFontSizeMultiplier={TEXT_CAP}>{block.ordered ? `${itemIndex + 1}.` : "•"}</RNText>
          <Paragraph runs={item} loaded={loaded} style={[styles.paragraph, text, styles.itemText]} />
        </View>)}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create((theme) => {
  const long = theme.ui.type.longText;
  return {
    root: { gap: theme.ui.space["3"] },
    heading: { color: theme.ui.color.ink, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, marginTop: theme.ui.space["3"] },
    leading: { marginTop: 0 },
    paragraph: { color: theme.ui.color.ink, fontSize: long.size, lineHeight: long.line, letterSpacing: long.tracking },
    textFace: { ...face.text },
    boldFace: { ...face.textMedium },
    boldWeight: { fontWeight: "500" },
    italic: { fontStyle: "italic" },
    link: { color: theme.ui.color.ink, textDecorationLine: "underline" },
    list: { gap: theme.ui.space["1"] },
    item: { flexDirection: "row", gap: theme.ui.space["2"] },
    marker: { color: theme.ui.color["ink-3"], fontSize: long.size, lineHeight: long.line, minWidth: 12 },
    itemText: { flex: 1 },
    // A text view brings no padding of its own to the page.
    selectable: { padding: 0 },
  };
});
