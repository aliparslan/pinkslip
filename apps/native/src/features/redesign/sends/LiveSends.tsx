import type { ApplySend } from "@pinkslip/core/api";
import { useApplySends, useAppliedJobs, useSession, useStopSend } from "@pinkslip/data";
import { router, useSegments } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LiveBar, type LiveJob } from "../apply-flow/WhileItRuns";
import { toast } from "../../../ui";
import { liveBar, liveBarDone, stoppable } from "../send-facts";
import { useGettingCode } from "./code-wait";

/** Done stays this long, then the bar leaves on its own (Paper 4.3). */
const DONE_MS = 4_000;

export type SendOpening = "answer" | "code" | "finish";

const asJob = (send: ApplySend): LiveJob => ({ id: send.job_id, company: send.company ?? "", title: send.title ?? "" });

/**
 * The live bar for real sends (Paper "4 · While it runs"): above the tab bar
 * on every tab while Pinkslip's browser applies, one job or several. It
 * says what's going and how far, turns to the one job that needs you, and
 * ends with how many went. Null when nothing is going, for the tab bar's
 * `above` slot.
 */
export function useLiveSends(): ReactNode | null {
  const enabled = Boolean(useSession().data?.me?.features?.auto_apply_send_enabled);
  const sends = useApplySends(enabled);
  const segments = useSegments() as readonly string[];
  // Jobs open in the tab you're on, or Today from You's stack, which has none.
  const tab = segments[1] && segments[1] !== "(you)" ? segments[1] : "(today)";
  // Jobs you've applied to yourself: their stops leave the bar.
  const appliedJobs = useAppliedJobs(enabled).data;
  const applied = useMemo(() => new Set((appliedJobs ?? []).map((job) => job.id)), [appliedJobs]);
  const gettingCode = useGettingCode(sends.data, enabled);
  const stopSend = useStopSend();
  const [now, setNow] = useState(() => Date.now());
  const facts = enabled ? liveBar(sends.data, now, applied, gettingCode) : null;

  // A stop that waits on you leaves the bar after a while, for Today.
  useEffect(() => {
    if (!facts) return;
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, [Boolean(facts)]);
  useEffect(() => setNow(Date.now()), [sends.dataUpdatedAt]);

  // When the run ends, the bar says how many went, then goes.
  const run = useRef<Set<string>>(new Set());
  const [done, setDone] = useState<{ words: string; detail?: string } | null>(null);
  useEffect(() => {
    if (facts) {
      for (const send of [facts.queue.now, ...facts.queue.next, ...facts.queue.sent]) if (send) run.current.add(send.job_id);
      setDone(null);
      return;
    }
    if (run.current.size === 0) return;
    const jobs = run.current;
    run.current = new Set();
    const newest = new Map<string, ApplySend>();
    for (const send of sends.data ?? []) if (!send.dry_run && jobs.has(send.job_id) && !newest.has(send.job_id)) newest.set(send.job_id, send);
    setDone(liveBarDone([...newest.values()].filter((send) => send.status === "submitted" || send.status === "unconfirmed")));
  }, [facts === null, sends.dataUpdatedAt]);
  useEffect(() => {
    if (!done) return;
    const leave = setTimeout(() => setDone(null), DONE_MS);
    return () => clearTimeout(leave);
  }, [done]);

  const openJob = (jobId: string, send?: SendOpening) => router.push({
    pathname: `/(tabs)/${tab}/jobs/[jobId]` as "/(tabs)/(today)/jobs/[jobId]",
    params: send ? { jobId, send } : { jobId },
  });

  if (facts) {
    const queue = { now: facts.queue.now && asJob(facts.queue.now), next: facts.queue.next.map(asJob), sent: facts.queue.sent.map((send) => ({ job: asJob(send), confirmed: send.status === "submitted" })) };
    const opening: SendOpening | undefined = facts.state.kind !== "needs" ? undefined
      : facts.state.action === "Enter" ? "code" : facts.state.action === "Finish" ? "finish" : "answer";
    // Several stops' questions are one sheet, in Today.
    const answerAll = () => router.push({ pathname: "/today", params: { answer: "sends" } });
    // Stop applying, from the queue: what's applying now and what's next.
    // One already pressing Submit carries on.
    const toStop = [facts.queue.now, ...facts.queue.next].filter((send): send is ApplySend => stoppable(send));
    const stopAll = toStop.length > 0 ? () => {
      void Promise.allSettled(toStop.map((send) => stopSend.mutateAsync(send.id))).then((results) => {
        const stopped = results.filter((result) => result.status === "fulfilled").length;
        if (stopped === 0) toast.error("Couldn't stop it. Try again.");
        else toast.show({ message: stopped === 1 ? "Stopped. Nothing was sent" : `Stopped ${stopped}. Nothing was sent`, icon: "autoApply" });
      });
    } : undefined;
    return <LiveBar state={facts.state} queue={queue} onOpenJob={(job) => openJob(job.id)} onStop={stopAll}
      onAction={facts.state.kind === "needs" && facts.state.group ? answerAll : facts.jobId ? () => openJob(facts.jobId!, opening) : undefined} />;
  }
  if (done) return <LiveBar state={{ kind: "done", ...done }} queue={{ now: null, next: [], sent: [] }} onDismiss={() => setDone(null)} />;
  return null;
}
