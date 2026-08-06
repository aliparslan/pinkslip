<script lang="ts">
  import { onMount } from "svelte";
  import { scrollContainer } from "../router";
  import type { Job } from "../lib/api";
  import JobRow from "./JobRow.svelte";

  let {
    jobs,
    viewed,
    onDismiss,
    onRestore,
    onSaved,
    onBlockRequest,
  }: {
    jobs: Job[];
    viewed: Set<string>;
    onDismiss?: (id: string) => void;
    onRestore?: (job: Job) => void;
    onSaved?: (id: string) => void;
    onBlockRequest?: (job: Job) => void;
  } = $props();

  const ESTIMATED_ROW_HEIGHT = 76;
  const OVERSCAN_BEFORE = 520;
  const OVERSCAN_AFTER = 760;

  let listElement: HTMLDivElement | undefined = $state(undefined);
  let startIndex = $state(0);
  let endIndex = $state(20);
  let topSpacer = $state(0);
  let bottomSpacer = $state(0);
  let frame: number | null = null;
  const measuredHeights = new Map<string, number>();

  let visibleJobs = $derived(jobs.slice(startIndex, endIndex));

  function heightFor(job: Job): number {
    return measuredHeights.get(job.id) ?? ESTIMATED_ROW_HEIGHT;
  }

  function recalculate() {
    frame = null;
    const scroller = scrollContainer();
    if (!scroller || !listElement || jobs.length === 0) {
      startIndex = 0;
      endIndex = jobs.length;
      topSpacer = 0;
      bottomSpacer = 0;
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const listRect = listElement.getBoundingClientRect();
    const listTop = listRect.top - scrollerRect.top + scroller.scrollTop;
    const viewportStart = Math.max(0, scroller.scrollTop - listTop - OVERSCAN_BEFORE);
    const viewportEnd = Math.max(0, scroller.scrollTop - listTop + scroller.clientHeight + OVERSCAN_AFTER);

    let cursor = 0;
    let nextStart = 0;
    while (nextStart < jobs.length) {
      const nextHeight = heightFor(jobs[nextStart]);
      if (cursor + nextHeight >= viewportStart) break;
      cursor += nextHeight;
      nextStart += 1;
    }

    const nextTopSpacer = cursor;
    let nextEnd = nextStart;
    while (nextEnd < jobs.length && cursor < viewportEnd) {
      cursor += heightFor(jobs[nextEnd]);
      nextEnd += 1;
    }

    let totalHeight = cursor;
    for (let index = nextEnd; index < jobs.length; index += 1) {
      totalHeight += heightFor(jobs[index]);
    }

    startIndex = nextStart;
    endIndex = Math.max(nextStart + 1, nextEnd);
    topSpacer = nextTopSpacer;
    bottomSpacer = Math.max(0, totalHeight - cursor);
  }

  function scheduleRecalculate() {
    if (typeof window === "undefined" || frame !== null) return;
    frame = window.requestAnimationFrame(recalculate);
  }

  function measureRow(node: HTMLElement, id: string) {
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height ?? 0;
      if (height <= 0 || Math.abs((measuredHeights.get(id) ?? 0) - height) < 0.5) return;
      measuredHeights.set(id, height);
      scheduleRecalculate();
    });
    observer.observe(node);

    return {
      update(nextId: string) {
        id = nextId;
        scheduleRecalculate();
      },
      destroy() {
        observer.disconnect();
      },
    };
  }

  $effect(() => {
    const activeIds = new Set(jobs.map((job) => job.id));
    for (const id of measuredHeights.keys()) {
      if (!activeIds.has(id)) measuredHeights.delete(id);
    }
    scheduleRecalculate();
  });

  onMount(() => {
    const scroller = scrollContainer();
    if (!scroller) return;

    const resizeObserver = new ResizeObserver(scheduleRecalculate);
    resizeObserver.observe(scroller);
    scroller.addEventListener("scroll", scheduleRecalculate, { passive: true });
    scheduleRecalculate();

    return () => {
      scroller.removeEventListener("scroll", scheduleRecalculate);
      resizeObserver.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  });
</script>

<div bind:this={listElement} class="virtual-job-list" aria-label="Jobs">
  <div class="virtual-job-spacer" style:height={`${topSpacer}px`} aria-hidden="true"></div>
  {#each visibleJobs as job (job.id)}
    <div use:measureRow={job.id}>
      <JobRow
        {job}
        viewed={viewed.has(job.id)}
        {onDismiss}
        {onRestore}
        {onSaved}
        {onBlockRequest}
      />
    </div>
  {/each}
  <div class="virtual-job-spacer" style:height={`${bottomSpacer}px`} aria-hidden="true"></div>
</div>

<style>
  .virtual-job-list {
    min-width: 0;
    contain: layout style;
  }

  .virtual-job-spacer {
    width: 1px;
    pointer-events: none;
  }
</style>
