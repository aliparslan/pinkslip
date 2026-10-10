import type { DescriptionBlock, DescriptionRun } from "@pinkslip/core/job-description";
import * as WebBrowser from "expo-web-browser";
import { Text as RNText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function Runs({ runs }: { runs: DescriptionRun[] }) {
  return runs.map((run, index) => <RNText key={index}
    style={[run.bold && styles.bold, run.italic && styles.italic, run.href && styles.link]}
    onPress={run.href ? () => void WebBrowser.openBrowserAsync(run.href!) : undefined}>{run.text}</RNText>);
}

/** A posting drawn natively from core's description blocks (the web renders
 * the same blocks), so no posting HTML is ever displayed. */
export function Description({ blocks }: { blocks: DescriptionBlock[] }) {
  return <View style={styles.root}>
    {blocks.map((block, index) => {
      if (block.kind === "heading") return <RNText key={index} accessibilityRole="header" style={styles.heading}><Runs runs={block.runs} /></RNText>;
      if (block.kind === "paragraph") return <RNText key={index} selectable style={styles.paragraph}><Runs runs={block.runs} /></RNText>;
      return <View key={index} style={styles.list}>
        {block.items.map((item, itemIndex) => <View key={itemIndex} style={styles.item}>
          <RNText style={styles.marker}>{block.ordered ? `${itemIndex + 1}.` : "•"}</RNText>
          <RNText selectable style={[styles.paragraph, styles.itemText]}><Runs runs={item} /></RNText>
        </View>)}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.space["3"] },
  heading: { color: theme.colors.ink, fontSize: theme.fontSize.md, fontWeight: "600", marginTop: theme.space["2"] },
  paragraph: { color: theme.colors["ink-2"], fontSize: theme.fontSize.md, lineHeight: 24 },
  bold: { fontWeight: "600", color: theme.colors.ink },
  italic: { fontStyle: "italic" },
  link: { color: theme.colors.accent, textDecorationLine: "underline" },
  list: { gap: theme.space["2"] },
  item: { flexDirection: "row", gap: theme.space["2"] },
  marker: { color: theme.colors["ink-3"], fontSize: theme.fontSize.md, lineHeight: 24, minWidth: 16 },
  itemText: { flex: 1 },
}));
