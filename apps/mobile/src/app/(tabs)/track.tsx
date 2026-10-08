import type { Job } from "@pinkslip/core/api";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, SearchField } from "../../components/controls";
import { Empty } from "../../components/Empty";
import { JobRow, ROW_INSET } from "../../components/JobRow";
import { Badge, Separator, Txt } from "../../components/primitives";
import { useAppliedJobs, useSavedJobs } from "../../lib/data";
import { usePalette } from "../../theme";

type Stage = "all" | "saved" | "applied";

interface Tracked {
  job: Job;
  stage: "saved" | "applied";
  /** When it last moved: applied, or (for saved jobs) when it was posted. */
  at: string;
}

/* Track: everything you've saved or applied to, filtered by stage. Stages
   past Applied (assessment, interviews, offers) come with the backend that
   records them. */
export default function TrackScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>("all");
  const [query, setQuery] = useState("");
  const saved = useSavedJobs();
  const applied = useAppliedJobs();

  const tracked = useMemo(() => {
    const appliedIds = new Set((applied.data ?? []).map((job) => job.id));
    const items: Tracked[] = [
      ...(applied.data ?? []).map((job) => ({ job, stage: "applied" as const, at: job.applied_at ?? job.first_seen_at })),
      // A job you saved and then applied to shows once, as applied.
      ...(saved.data ?? [])
        .filter((job) => !appliedIds.has(job.id))
        .map((job) => ({ job, stage: "saved" as const, at: job.posted_at ?? job.first_seen_at })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [saved.data, applied.data]);

  const counts = {
    saved: tracked.filter((item) => item.stage === "saved").length,
    applied: tracked.filter((item) => item.stage === "applied").length,
  };
  const needle = query.trim().toLowerCase();
  const shown = tracked.filter(
    (item) =>
      (stage === "all" || item.stage === stage) &&
      (!needle || item.job.title.toLowerCase().includes(needle) || item.job.company_name.toLowerCase().includes(needle)),
  );
  const loading = saved.isPending || applied.isPending;
  const failed = saved.isError || applied.isError;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: palette.line }}>
        <View style={{ paddingHorizontal: 16 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search your applications" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <Chip label="All" pressed={stage === "all"} onPress={() => setStage("all")} />
          <Chip label="Saved" count={counts.saved} pressed={stage === "saved"} onPress={() => setStage("saved")} />
          <Chip label="Applied" count={counts.applied} pressed={stage === "applied"} onPress={() => setStage("applied")} />
        </ScrollView>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => item.job.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) =>
          stage === "saved" ? (
            // Saved jobs keep the Jobs row: place and pay still decide whether you apply.
            <JobRow job={item.job} from="track" />
          ) : (
            <JobRow
              job={item.job}
              from="track"
              timing={item.stage === "applied" ? "applied" : "posted"}
              detail={
                <>
                  <Badge tone={item.stage === "applied" ? "accent" : "neutral"}>{item.stage === "applied" ? "Applied" : "Saved"}</Badge>
                  {item.job.closed_at ? (
                    <Txt variant="meta" color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>
                      Listing closed
                    </Txt>
                  ) : null}
                </>
              }
            />
          )
        }
        ItemSeparatorComponent={() => <Separator inset={ROW_INSET} />}
        refreshControl={
          <RefreshControl
            refreshing={(saved.isRefetching || applied.isRefetching) && !loading}
            onRefresh={() => {
              void saved.refetch();
              void applied.refetch();
            }}
            tintColor={palette.ink3}
          />
        }
        ListHeaderComponent={
          tracked.length ? (
            <Txt variant="meta" color="ink2" tabular style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              {counts.applied} applied · {counts.saved} saved
            </Txt>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={palette.ink3} />
          ) : failed ? (
            <Empty title="Couldn't load Track" body="Check your connection and try again." action="Try again" onAction={() => {
              void saved.refetch();
              void applied.refetch();
            }} />
          ) : tracked.length ? (
            <Empty title="Nothing here" body={needle ? "No saved or applied jobs match that search." : "Nothing at this stage yet."} />
          ) : (
            <Empty
              title="Nothing in Track yet"
              body="Save a job or apply to one, and it shows up here."
              action="Browse jobs"
              onAction={() => router.navigate("/")}
            />
          )
        }
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </View>
  );
}
