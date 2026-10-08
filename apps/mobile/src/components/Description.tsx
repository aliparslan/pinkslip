/* A posting's description, drawn as native text from the blocks the shared
   core parses out of its HTML. Spacing follows the web's prose: body text at
   16/24, section heads at 18 with room above. */

import { parseJobDescription, type DescriptionRun } from "@pinkslip/core/job-description";
import * as WebBrowser from "expo-web-browser";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { type, usePalette } from "../theme";

function Runs({ runs }: { runs: DescriptionRun[] }) {
  const palette = usePalette();
  return runs.map((run, index) => (
    <Text
      key={index}
      onPress={run.href ? () => void WebBrowser.openBrowserAsync(run.href!) : undefined}
      style={[
        run.bold ? { fontWeight: "600", color: palette.ink } : null,
        run.italic ? { fontStyle: "italic" } : null,
        run.href ? { color: palette.accentText, textDecorationLine: "underline" } : null,
      ]}
    >
      {run.text}
    </Text>
  ));
}

export function Description({ html, title, companyName }: { html: string | null; title: string; companyName: string }) {
  const palette = usePalette();
  const blocks = useMemo(() => parseJobDescription(html, { title, companyName }), [html, title, companyName]);
  const body = [type("body"), { color: palette.ink2 }];
  return (
    <View>
      {blocks.map((block, index) => {
        const after = index > 0 && blocks[index - 1]?.kind === "heading";
        const gap = index === 0 ? 0 : block.kind === "heading" ? 28 : after ? 8 : 12;
        if (block.kind === "heading") {
          return (
            <Text key={index} accessibilityRole="header" style={[type("lead", "semibold"), { color: palette.ink, marginTop: gap }]}>
              <Runs runs={block.runs} />
            </Text>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <Text key={index} selectable style={[body, { marginTop: gap }]}>
              <Runs runs={block.runs} />
            </Text>
          );
        }
        return (
          <View key={index} style={{ marginTop: gap, gap: 6 }}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={{ flexDirection: "row", gap: 10, paddingLeft: 4 }}>
                <Text style={[body, { color: palette.ink3, width: block.ordered ? 18 : 8 }]}>
                  {block.ordered ? `${itemIndex + 1}.` : "•"}
                </Text>
                <Text selectable style={[body, { flex: 1 }]}>
                  <Runs runs={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
