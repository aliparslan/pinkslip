import type { Job } from "@pinkslip/core/api";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, SearchField } from "../../components/controls";
import { Empty } from "../../components/Empty";
import { JobRow, ROW_INSET } from "../../components/JobRow";
import { Separator, Txt } from "../../components/primitives";
import { isNewJob, useFeed, useViewed } from "../../lib/data";
import { locationSummary, setFilters, useFilters } from "../../lib/filters";
import { usePalette } from "../../theme";

/* Jobs: search and three chips over the feed. No big title; the tab names
   the page. New shows only what's new right now, and holds that set while
   you go through it. */
export default function JobsScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const filters = useFilters();
  const [draft, setDraft] = useState(filters.query);
  const [newIds, setNewIds] = useState<Set<string> | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const feed = useFeed(filters);
  const viewed = useViewed();

  // Search as you type, a beat after you stop.
  useEffect(() => {
    const timer = setTimeout(() => setFilters({ query: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const jobs = useMemo(() => {
    const seen = new Set<string>();
    const all: Job[] = [];
    for (const page of feed.data?.pages ?? []) {
      for (const job of page.jobs) {
        if (!seen.has(job.id)) {
          seen.add(job.id);
          all.push(job);
        }
      }
    }
    return all;
  }, [feed.data]);

  const fresh = jobs.filter((job) => isNewJob(job, viewed.data));
  const shown = newIds ? jobs.filter((job) => newIds.has(job.id)) : jobs;
  const total = feed.data?.pages[0]?.meta.total;
  const filtering = filters.locations.length > 0 || filters.minPayK !== null || newIds !== null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          gap: 10,
          backgroundColor: palette.bg,
          borderBottomWidth: 1,
          borderBottomColor: scrolled ? palette.line : "transparent",
        }}
      >
        <View style={{ paddingHorizontal: 16 }}>
          <SearchField value={draft} onChangeText={setDraft} placeholder="Search jobs or companies" />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <Chip
            label={locationSummary(filters.locations)}
            pressed={filters.locations.length > 0}
            menu
            onPress={() => router.push("/filters/location")}
          />
          <Chip
            label={filters.minPayK ? `$${filters.minPayK}K+` : "Pay"}
            pressed={filters.minPayK !== null}
            menu
            onPress={() => router.push("/filters/pay")}
          />
          <Chip
            label="New"
            count={newIds ? newIds.size : fresh.length}
            pressed={newIds !== null}
            onPress={() => setNewIds(newIds ? null : new Set(fresh.map((job) => job.id)))}
          />
          {filtering ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setFilters({ locations: [], minPayK: null });
                setNewIds(null);
              }}
            >
              Clear
            </Button>
          ) : null}
        </ScrollView>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(job) => job.id}
        renderItem={({ item }) => <JobRow job={item} isNew={isNewJob(item, viewed.data)} viewed={viewed.data?.has(item.id)} />}
        ItemSeparatorComponent={() => <Separator inset={ROW_INSET} />}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 2)}
        scrollEventThrottle={32}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (!newIds && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => {
              setNewIds(null);
              void feed.refetch();
              void viewed.refetch();
            }}
            tintColor={palette.ink3}
          />
        }
        ListHeaderComponent={
          <Txt variant="meta" color="ink3" tabular style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
            {feed.isPending
              ? "Finding jobs…"
              : newIds
                ? `${shown.length} new`
                : total !== undefined
                  ? `${total.toLocaleString()} ${total === 1 ? "job" : "jobs"}`
                  : " "}
          </Txt>
        }
        ListEmptyComponent={
          feed.isPending ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={palette.ink3} />
          ) : feed.isError ? (
            <Empty
              title="Couldn't load jobs"
              body={feed.error instanceof Error ? feed.error.message : "Please try again."}
              action="Try again"
              onAction={() => void feed.refetch()}
            />
          ) : (
            <Empty
              title="No jobs match"
              body="Try a broader search, or clear your filters."
              action="Clear filters"
              onAction={() => {
                setDraft("");
                setFilters({ query: "", locations: [], minPayK: null });
                setNewIds(null);
              }}
            />
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 20 }} color={palette.ink3} /> : <View style={{ height: 24 }} />
        }
      />
    </View>
  );
}
