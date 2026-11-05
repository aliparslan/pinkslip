import { File, Paths } from "expo-file-system";
import { Stack } from "expo-router";
import { Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { WebView } from "react-native-webview";
import { useLocalResumeFile, type LocalResumeFile } from "../../../platform/resume-file";
import { EmptyState, PAGE_BAR, PageBar, PageBarButton, Text, toast } from "../../../ui";
import { addedLine } from "./facts";

/** Shares the PDF under its own name ("Jordan Lee Resume.pdf") rather than
 * the kept copy's ("resume.pdf"). */
async function shareFile(file: LocalResumeFile) {
  try {
    const named = new File(Paths.cache, /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`);
    if (named.exists) named.delete();
    await new File(file.uri).copy(named);
    await Share.share({ url: named.uri, title: file.name });
  } catch {
    toast.error("Couldn't share the PDF. Try again.");
  }
}

/** The folder the kept PDF sits in, which the page may read. */
const folderOf = (uri: string) => uri.replace(/[^/]+$/, "");

/**
 * Your resume's PDF, full screen (owner, 2026-11-04, Paper "Resume file ·
 * Nov 4", F2): a page, since it's something you read. Its name and when it
 * was added sit in the bar between Back and Share; more pages scroll. Share
 * is iOS's own (Files, AirDrop, Mail). iOS draws the PDF itself, white
 * whatever the theme: it's a document.
 */
export function ResumeFilePage() {
  const file = useLocalResumeFile();
  const insets = useSafeAreaInsets();
  const top = insets.top + PAGE_BAR + 8;
  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    {file
      ? <WebView source={{ uri: file.uri }} originWhitelist={["*"]} allowFileAccess allowingReadAccessToURL={folderOf(file.uri)}
        style={styles.fill} contentInset={{ top, bottom: insets.bottom }} contentInsetAdjustmentBehavior="never" />
      : <View style={[styles.fill, { paddingTop: top }]}>
        <EmptyState title="No PDF on this phone" message="Import one from Resume to see it here." />
      </View>}
    <PageBar title={file ? <View style={styles.title}>
      <Text role="subhead" weight="medium" lines={1}>{file.name}</Text>
      <Text role="footnote" tone="ink-3" lines={1}>{addedLine(file.savedAt)}</Text>
    </View> : undefined} actions={file ? <PageBarButton icon="share" label="Share" onPress={() => void shareFile(file)} /> : undefined} />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  title: { alignItems: "center" },
}));
