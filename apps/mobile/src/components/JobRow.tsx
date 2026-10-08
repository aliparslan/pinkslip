/* A job in a list: two lines beside the company mark. The title and how
   old it is; then company, place, and pay. A pink dot on the mark means new;
   a bookmark at the end means saved. Press and hold for the job's actions
   and a peek at its page. */

import type { Job } from "@pinkslip/core/api";
import { formatRowLocation, formatRowSalary } from "@pinkslip/core/job-format";
import { compactJobAge } from "@pinkslip/core/job-timing";
import { timeAgo } from "@pinkslip/core/utils";
import { Link } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useJobAction } from "../lib/data";
import { usePalette } from "../theme";
import { CompanyMark, Icon, Txt } from "./primitives";

export const ROW_INSET = 72;

export function JobRow({
  job,
  isNew = false,
  viewed = false,
  timing = "posted",
  detail,
  from,
}: {
  job: Job;
  /** The tab the row is in, so the job page's back button names it. */
  from?: "track";
  isNew?: boolean;
  viewed?: boolean;
  /** Track shows when you applied instead of when it was posted. */
  timing?: "posted" | "applied";
  /** Replaces place and pay on the second line, as Track's stage does. */
  detail?: ReactNode;
}) {
  const palette = usePalette();
  const action = useJobAction();
  const [pressed, setPressed] = useState(false);
  const closed = Boolean(job.closed_at);
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const age =
    timing === "applied" && job.applied_at
      ? timeAgo(job.applied_at).replace(/ ago$/, "")
      : closed
        ? "Closed"
        : compactJobAge(job);
  const place = formatRowLocation(job.location);
  const pay = formatRowSalary(job.salary);
  const dot = (
    <Txt variant="meta" color="ink3" style={{ flexShrink: 0, paddingHorizontal: 6 }}>
      ·
    </Txt>
  );

  return (
    <Link href={{ pathname: "/jobs/[id]", params: from ? { id: job.id, from } : { id: job.id } }} asChild>
      <Link.Trigger>
        {/* Link passes its press through to this Pressable, so the row keeps
            a plain style object and tracks pressing itself. */}
        <Pressable
          accessibilityLabel={`${isNew ? "New: " : ""}${job.title} at ${job.company_name}`}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: pressed ? palette.control : palette.bg,
          }}
        >
          <View>
            <CompanyMark name={job.company_name} domain={job.company_domain} />
            {isNew ? (
              <View
                style={{
                  position: "absolute",
                  top: -5,
                  right: -5,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: palette.accent,
                  borderWidth: 2,
                  borderColor: palette.bg,
                }}
              />
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt
                numberOfLines={1}
                weight={closed || viewed ? "regular" : "medium"}
                color={closed ? "ink3" : viewed ? "ink2" : "ink"}
                style={{ flex: 1 }}
              >
                {job.title}
              </Txt>
              {age ? (
                <Txt variant="meta" color="ink3" tabular>
                  {age}
                </Txt>
              ) : null}
            </View>
            {/* Where space runs out the place shortens first, then the
                company. Pay never does. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Txt numberOfLines={1} variant="meta" weight="medium" color="ink2" style={{ flexShrink: 0, maxWidth: "50%" }}>
                {job.company_name}
              </Txt>
              {detail ? (
                <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 6 }}>{detail}</View>
              ) : (
                <>
                  {place ? (
                    <>
                      {dot}
                      <Txt numberOfLines={1} variant="meta" color="ink3" style={{ flexShrink: 1 }}>
                        {place}
                      </Txt>
                    </>
                  ) : null}
                  {pay ? (
                    <>
                      {dot}
                      <Txt numberOfLines={1} variant="meta" color="ink2" tabular style={{ flexShrink: 0 }}>
                        {pay}
                      </Txt>
                    </>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {saved ? <Icon name="bookmark.fill" size={12} color={palette.accentText} fallback="▮" /> : null}
                </>
              )}
            </View>
          </View>
        </Pressable>
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        <Link.MenuAction
          icon={saved ? "bookmark.slash" : "bookmark"}
          onPress={() => action.mutate({ job, action: saved ? "unsave" : "save" })}
        >
          {saved ? "Unsave" : "Save"}
        </Link.MenuAction>
        <Link.MenuAction
          icon={applied ? "arrow.uturn.backward" : "checkmark.circle"}
          onPress={() => action.mutate({ job, action: applied ? "unapply" : "apply" })}
        >
          {applied ? "Mark as not applied" : "Mark as applied"}
        </Link.MenuAction>
        <Link.MenuAction icon="eye.slash" destructive onPress={() => action.mutate({ job, action: "hide" })}>
          Hide this job
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
}
