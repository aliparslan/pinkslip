import type { Job } from "@pinkslip/core/api";
import { jobTimingLabel } from "@pinkslip/core/job-timing";
import { timeAgo } from "@pinkslip/core/utils";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../components/controls";
import { Description } from "../../../components/Description";
import { Empty } from "../../../components/Empty";
import { Facts } from "../../../components/Facts";
import { CompanyMark, Icon, Txt } from "../../../components/primitives";
import { useJob, useJobAction, useMarkViewed, useYourPlaces } from "../../../lib/data";
import { bandFor, jobPayBands, joinPlaces, needsPlaceSheet, payRange, placesOf } from "../../../lib/places";
import { formatRowLocation } from "@pinkslip/core/job-format";
import { usePalette } from "../../../theme";

/** A native action sheet; the web preview falls back to an alert. */
function choose(options: { title: string; destructive?: boolean; onPress: () => void }[], title?: string): void {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((option) => option.title), "Cancel"],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options.flatMap((option, index) => (option.destructive ? [index] : [])),
      },
      (index) => options[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title ?? "", undefined, [...options.map((option) => ({ text: option.title, onPress: option.onPress })), { text: "Cancel", style: "cancel" }]);
}

const shareUrl = (job: Job) => `https://pinkslip.work/jobs/${job.id}`;

/* A job. The company and when it was posted on a slim row, the exact title,
   where and what it pays, then the posting. The bar holds actions only:
   Save (which becomes where the job stands in Track) and Apply. */
export default function JobScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const query = useJob(id);
  const action = useJobAction();
  const markViewed = useMarkViewed();
  const yours = useYourPlaces();
  const [asking, setAsking] = useState(false);
  const [titleBottom, setTitleBottom] = useState(Number.POSITIVE_INFINITY);
  const [pastTitle, setPastTitle] = useState(false);
  const job = query.data;

  useEffect(() => {
    if (id) markViewed(id);
  }, [id]);

  const more = (job: Job) => {
    const applied = Boolean(job.applied);
    choose([
      ...(applied ? [] : [{ title: "Mark as applied", onPress: () => action.mutate({ job, action: "apply" }) }]),
      { title: "Open original posting", onPress: () => void WebBrowser.openBrowserAsync(job.url) },
      { title: "Share", onPress: () => void Share.share({ url: shareUrl(job), message: `${job.title} at ${job.company_name}` }) },
      {
        title: "Hide this job",
        destructive: true,
        onPress: () => {
          action.mutate({ job, action: "hide" });
          router.back();
        },
      },
    ]);
  };

  const header = (
    <Stack.Screen
      options={{
        title: pastTitle && job ? job.title : "",
        headerBackTitle: from === "track" ? "Track" : "Jobs",
        headerRight: job
          ? () => (
              <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 4 }}>
                <Pressable accessibilityLabel="Share" hitSlop={8} onPress={() => void Share.share({ url: shareUrl(job), message: `${job.title} at ${job.company_name}` })}>
                  <Icon name="square.and.arrow.up" size={19} color={palette.ink} fallback="⇪" />
                </Pressable>
                <Pressable accessibilityLabel="More actions" hitSlop={8} onPress={() => more(job)}>
                  <Icon name="ellipsis" size={19} color={palette.ink} fallback="⋯" />
                </Pressable>
              </View>
            )
          : undefined,
      }}
    />
  );

  if (!job) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        {header}
        {query.isError ? (
          <Empty title="This job isn't available" body="It may have been taken down." action="Back" onAction={() => router.back()} />
        ) : (
          <ActivityIndicator style={{ marginTop: 120 }} color={palette.ink3} />
        )}
      </View>
    );
  }

  const closed = Boolean(job.closed_at);
  const long = job.title.length > 60;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={32}
        onScroll={(event) => {
          const { contentOffset, contentInset } = event.nativeEvent;
          setPastTitle(contentOffset.y + contentInset.top > titleBottom);
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 + insets.bottom }}
      >
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 24 }}>
            <CompanyMark name={job.company_name} domain={job.company_domain} size="sm" />
            <Txt weight="medium" numberOfLines={1} style={{ flexShrink: 1, marginLeft: 2 }}>
              {job.company_name}
            </Txt>
            <Txt color="ink3">·</Txt>
            <Txt color={closed ? "bad" : "ink3"} numberOfLines={1} style={{ flexShrink: 1 }}>
              {closed ? `Closed ${timeAgo(job.closed_at!)}` : jobTimingLabel(job)}
            </Txt>
          </View>
          <Txt
            variant={long ? "title" : "heading"}
            weight="semibold"
            accessibilityRole="header"
            onLayout={(event) => setTitleBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          >
            {job.title}
          </Txt>
          <JobFacts job={job} yours={yours} />
        </View>

        <View style={{ height: 1, backgroundColor: palette.line, marginTop: 20, marginBottom: 20 }} />

        {job.description ? (
          <Description html={job.description} title={job.title} companyName={job.company_name} />
        ) : job.content_pending ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={palette.ink3} />
            <Txt color="ink2">Pulling the full posting now…</Txt>
          </View>
        ) : (
          <Txt color="ink2">The full description isn't available here. Open the posting to read it.</Txt>
        )}
      </ScrollView>

      <ActionBar job={job} asking={asking} setAsking={setAsking} />
    </View>
  );
}

/** Where and what it pays. Postings with many places, or pay by place, lead
 * with your city and open the rest in a sheet. */
function JobFacts({ job, yours }: { job: Job; yours: string[] }) {
  const places = placesOf(job, yours);
  const bands = jobPayBands(job.salary);
  const open = () => router.push({ pathname: "/jobs/[id]/places", params: { id: job.id } });
  if (needsPlaceSheet(job) && places.length) {
    const lead = places[0]!;
    const leadPay = bands.length ? (bandFor(lead, bands)?.amount ?? payRange(bands)) : null;
    return (
      <Facts>
        {[
          <Pressable key="where" onPress={open} accessibilityRole="button" accessibilityLabel={`${places.length} places. Show all`}>
            <Txt color="ink2">
              {formatRowLocation(lead) ?? lead}{" "}
              <Txt weight="medium" color="accentText">
                +{places.length - 1} more
              </Txt>
            </Txt>
          </Pressable>,
          leadPay ? (
            <Pressable key="pay" onPress={open} accessibilityRole="button">
              <Txt color="ink2" tabular>
                {leadPay}
              </Txt>
            </Pressable>
          ) : (
            <Txt key="pay" color="ink3">
              No pay listed
            </Txt>
          ),
        ]}
      </Facts>
    );
  }
  return (
    <Facts>
      {[
        places.length ? (
          <Txt key="where" color="ink2" style={{ flexShrink: 1 }}>
            {joinPlaces(places)}
          </Txt>
        ) : null,
        <Txt key="pay" color={bands.length ? "ink2" : "ink3"} tabular>
          {bands.length ? payRange(bands) : "No pay listed"}
        </Txt>,
      ]}
    </Facts>
  );
}

/** Actions only, under the thumb. Save becomes the job's stage once it's in
 * Track; Apply opens the posting and asks, when you come back, whether you
 * applied. */
function ActionBar({ job, asking, setAsking }: { job: Job; asking: boolean; setAsking: (asking: boolean) => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const action = useJobAction();
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const closed = Boolean(job.closed_at);

  const apply = async () => {
    await WebBrowser.openBrowserAsync(job.url, { controlsColor: palette.accentText, dismissButtonStyle: "done" });
    setAsking(true);
  };

  const status = () => {
    if (!saved && !applied) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      action.mutate({ job, action: "save" });
      return;
    }
    if (applied) {
      choose([{ title: "Mark as not applied", destructive: true, onPress: () => action.mutate({ job, action: "unapply" }) }], "Applied");
      return;
    }
    choose(
      [
        { title: "Mark as applied", onPress: () => action.mutate({ job, action: "apply" }) },
        { title: "Remove from Track", destructive: true, onPress: () => action.mutate({ job, action: "unsave" }) },
      ],
      "Saved",
    );
  };

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: palette.bg,
        borderTopWidth: 1,
        borderTopColor: palette.line,
      }}
    >
      {asking ? (
        <>
          <Txt weight="medium" style={{ flex: 1 }}>
            Did you apply?
          </Txt>
          <Button size="lg" style={{ paddingHorizontal: 16 }} onPress={() => setAsking(false)}>
            Not yet
          </Button>
          <Button
            variant="primary"
            size="lg"
            style={{ paddingHorizontal: 16 }}
            onPress={() => {
              setAsking(false);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              action.mutate({ job, action: "apply" });
            }}
          >
            Yes, applied
          </Button>
        </>
      ) : (
        <>
          <Button
            size="lg"
            style={{ paddingHorizontal: 16 }}
            onPress={status}
            accessibilityLabel={applied ? "Applied. Change" : saved ? "Saved. Change" : "Save job"}
            leading={
              applied ? (
                <Icon name="checkmark" size={15} weight="bold" color={palette.good} fallback="✓" />
              ) : (
                <Icon name={saved ? "bookmark.fill" : "bookmark"} size={17} color={saved ? palette.accentText : palette.ink} fallback="▮" />
              )
            }
            trailing={saved || applied ? <Icon name="chevron.down" size={12} weight="semibold" color={palette.ink3} fallback="⌄" /> : undefined}
          >
            {applied ? "Applied" : saved ? "Saved" : "Save"}
          </Button>
          {closed ? (
            <Txt variant="meta" color="ink3" style={{ flex: 1, paddingHorizontal: 4 }}>
              This listing closed {timeAgo(job.closed_at!)}.
            </Txt>
          ) : applied ? (
            <Button size="lg" style={{ flex: 1 }} onPress={() => void WebBrowser.openBrowserAsync(job.url)}>
              Open posting
            </Button>
          ) : (
            <Button variant="primary" size="lg" style={{ flex: 1 }} onPress={() => void apply()}>
              Apply
            </Button>
          )}
        </>
      )}
    </View>
  );
}
