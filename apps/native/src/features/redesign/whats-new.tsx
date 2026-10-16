import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { storage } from "../../platform/storage";
import { Button, IconTile, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, Text, useSheet, type IconName, type TileMeaning } from "../../ui";
import { YouPage } from "./you/Page";

export interface ReleaseItem {
  icon: IconName;
  meaning: TileMeaning;
  title: string;
  /** One line on what it does for you. */
  line: string;
}

export interface Release {
  /** "1.4": a big release, the first two parts of the version. */
  version: string;
  /** "Nov 2026". */
  when: string;
  items: ReleaseItem[];
  /** Shown once as the sheet at launch; older releases only list in You. */
  announce: boolean;
}

/** Every big release, newest first, up to three items each (Paper
 * "Approved", N1 and N3). Items don't link anywhere. */
export const RELEASES: readonly Release[] = [
  {
    version: "1.4",
    when: "Nov 2026",
    announce: true,
    items: [
      { icon: "today", meaning: "find", title: "Today", line: "What needs you and what's coming, in one place." },
      { icon: "autoApply", meaning: "pro", title: "Ask first", line: "Strong matches each morning. Pick some, and they're sent for you." },
      { icon: "offline", meaning: "app", title: "Works offline", line: "Jobs you've already seen stay readable without a connection." },
    ],
  },
  {
    version: "1.3",
    when: "Oct 2026",
    announce: false,
    items: [
      { icon: "email", meaning: "find", title: "Email tracking", line: "Applications move on their own when companies email you." },
    ],
  },
];

/** "1.3" from "1.3.4". */
export function bigVersion(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

function newer(a: string, b: string): boolean {
  const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
  return aMajor !== bMajor ? aMajor > bMajor : aMinor > bMinor;
}

/** The releases this copy of the app has, newest first. */
export function releasesUpTo(version: string): Release[] {
  const current = bigVersion(version);
  return RELEASES.filter((release) => !newer(release.version, current));
}

const appVersion = () => Constants.expoConfig?.version ?? "0.0";

/** Which big release this phone last showed; set on every launch. */
const SEEN = "whats-new.seen";

/** The release to show once at launch: a big release with notes, for
 * someone who had the app before it. A new install starts from here. */
export function releaseToShow(current: string, seen: string | undefined, hadAppBefore: boolean): Release | null {
  const release = RELEASES.find((candidate) => candidate.version === bigVersion(current));
  if (!release?.announce) return null;
  if (seen === undefined) return hadAppBefore ? release : null;
  return newer(release.version, seen) ? release : null;
}

/** The sheet, once, the first time the app opens after a big release. */
export function WhatsNewOnLaunch() {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const seen = storage.getString(SEEN);
    // Anything already stored means the app was used before this launch.
    const hadAppBefore = storage.getAllKeys().some((key) => key !== SEEN);
    setRelease(releaseToShow(appVersion(), seen, hadAppBefore));
    storage.set(SEEN, bigVersion(appVersion()));
  }, []);
  return <WhatsNewSheet release={release} onClosed={() => setRelease(null)} />;
}

/** "New in 1.4" (N1): the items in one white group, then a grey Got it. */
export function WhatsNewSheet({ release, onClosed }: { release: Release | null; onClosed: () => void }) {
  return <SheetModal open={release !== null} onClosed={onClosed}>
    {release ? <WhatsNewStep release={release} /> : null}
  </SheetModal>;
}

function WhatsNewStep({ release }: { release: Release }) {
  const sheet = useSheet();
  return <SheetStep id={`new-${release.version}`}>
    <SheetHeader title={`New in ${release.version}`} />
    <View style={[styles.group, styles.inSheet]}><ReleaseItems items={release.items} /></View>
    <Button fullWidth onPress={sheet.close}>Got it</Button>
  </SheetStep>;
}

function ReleaseItems({ items }: { items: ReleaseItem[] }) {
  return <>{items.map((item) => <View key={item.title} style={styles.item}>
    <View style={styles.tile}><IconTile icon={item.icon} meaning={item.meaning} /></View>
    <View style={styles.text}>
      <Text weight="medium">{item.title}</Text>
      <Text role="subhead" tone="ink-2">{item.line}</Text>
    </View>
  </View>)}</>;
}

/** What's new in You (N3): each release, newest first, a small header over
 * a white card of its items. */
export function WhatsNewPage() {
  return <YouPage title="What's new">
    {releasesUpTo(appVersion()).map((release) => <View key={release.version} style={styles.release}>
      <View style={styles.header}>
        <Text role="footnote" weight="medium" tone="ink-2">{release.version}</Text>
        <Text role="footnote" tone="ink-3">{release.when}</Text>
      </View>
      <View style={styles.group}><ReleaseItems items={release.items} /></View>
    </View>)}
  </YouPage>;
}

/** The value on You's row: the newest release this copy has. */
export function latestReleaseVersion(): string | undefined {
  return releasesUpTo(appVersion())[0]?.version;
}

const styles = StyleSheet.create((theme) => ({
  release: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter },
  header: { flexDirection: "row", gap: 6, paddingHorizontal: theme.ui.space["4"] },
  group: {
    gap: theme.ui.space["4"],
    padding: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["bg-grouped"],
  },
  inSheet: { borderRadius: SHEET_GROUP_RADIUS, backgroundColor: theme.ui.color["sheet-group"] },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  // Centred on the title's line.
  tile: { marginTop: 2 },
  text: { flex: 1, gap: 2 },
}));
