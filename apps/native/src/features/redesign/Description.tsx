import type { DescriptionBlock, DescriptionRun } from "@pinkslip/core/job-description";
import * as WebBrowser from "expo-web-browser";
import { Text as RNText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "../../ui";

function Runs({ runs, loaded }: { runs: DescriptionRun[]; loaded: boolean }) {
  return runs.map((run, index) => <RNText key={index}
    style={[run.bold && (loaded ? styles.boldFace : styles.boldWeight), run.italic && styles.italic, run.href && styles.link]}
    onPress={run.href ? () => void WebBrowser.openBrowserAsync(run.href!) : undefined}>{run.text}</RNText>);
}

/** The posting in the redesign's long-text style (17/24), drawn from core's
 * blocks so no posting HTML is ever displayed. */
export function Description({ blocks }: { blocks: DescriptionBlock[] }) {
  const loaded = useUiFontsLoaded();
  const text = loaded ? styles.textFace : null;
  return <View style={styles.root}>
    {blocks.map((block, index) => {
      if (block.kind === "heading") {
        return <RNText key={index} accessibilityRole="header" style={[styles.heading, loaded ? styles.boldFace : styles.boldWeight]}>
          <Runs runs={block.runs} loaded={loaded} />
        </RNText>;
      }
      if (block.kind === "paragraph") return <RNText key={index} selectable style={[styles.paragraph, text]}><Runs runs={block.runs} loaded={loaded} /></RNText>;
      return <View key={index} style={styles.list}>
        {block.items.map((item, itemIndex) => <View key={itemIndex} style={styles.item}>
          <RNText style={[styles.marker, text]}>{block.ordered ? `${itemIndex + 1}.` : "•"}</RNText>
          <RNText selectable style={[styles.paragraph, text, styles.itemText]}><Runs runs={item} loaded={loaded} /></RNText>
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
    paragraph: { color: theme.ui.color.ink, fontSize: long.size, lineHeight: long.line, letterSpacing: long.tracking },
    textFace: { fontFamily: faces.text },
    boldFace: { fontFamily: faces.textMedium },
    boldWeight: { fontWeight: "500" },
    italic: { fontStyle: "italic" },
    link: { color: theme.ui.color.ink, textDecorationLine: "underline" },
    list: { gap: theme.ui.space["1"] },
    item: { flexDirection: "row", gap: theme.ui.space["2"] },
    marker: { color: theme.ui.color["ink-3"], fontSize: long.size, lineHeight: long.line, minWidth: 12 },
    itemText: { flex: 1 },
  };
});
