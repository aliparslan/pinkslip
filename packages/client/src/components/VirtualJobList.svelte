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
    onSaved?: (id: string, saved?: boolean) => void;
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
  let activeSwipeId: string | null = $state(null);
  let frame: number | null = null;
  const measuredHeights = new Map<string, number>();
  let cumulativeHeights: number[] = [0];

  let visibleJobs = $derived(jobs.slice(startIndex, endIndex));

  function heightFor(job: Job): number {
    return measuredHeights.get(job.id) ?? ESTIMATED_ROW_HEIGHT;
  }

  function rebuildCumulativeHeights() {
    const next = new Array<number>(jobs.length + 1);
    next[0] = 0;
    for (let index = 0; index < jobs.length; index += 1) {
      next[index + 1] = next[index] + heightFor(jobs[index]);
    }
    cumulativeHeights = next;
  }

  function rowAtOffset(offset: number): number {
    let low = 0;
    let high = jobs.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((cumulativeHeights[middle + 1] ?? 0) < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function rowsThroughOffset(offset: number): number {
    let low = 0;
    let high = jobs.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((cumulativeHeights[middle] ?? 0) <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.min(jobs.length, low);
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

    const nextStart = rowAtOffset(viewportStart);
    const nextEnd = Math.max(nextStart + 1, rowsThroughOffset(viewportEnd));
    const nextTopSpacer = cumulativeHeights[nextStart] ?? 0;
    const renderedBottom = cumulativeHeights[Math.min(jobs.length, nextEnd)] ?? nextTopSpacer;
    const totalHeight = cumulativeHeights[jobs.length] ?? renderedBottom;

    startIndex = nextStart;
    endIndex = Math.min(jobs.length, nextEnd);
    topSpacer = nextTopSpacer;
    bottomSpacer = Math.max(0, totalHeight - renderedBottom);
  }

  function scheduleRecalculate() {
    if (typeof window === "undefined" || frame !== null) return;
    frame = window.requestAnimationFrame(recalculate);
  }

  function handleScroll() {
    activeSwipeId = null;
    scheduleRecalculate();
  }

  function measureRow(node: HTMLElement, id: string) {
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height ?? 0;
      if (height <= 0 || Math.abs((measuredHeights.get(id) ?? 0) - height) < 0.5) return;
      measuredHeights.set(id, height);
      rebuildCumulativeHeights();
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
    if (activeSwipeId && !activeIds.has(activeSwipeId)) activeSwipeId = null;
    rebuildCumulativeHeights();
    scheduleRecalculate();
  });

  onMount(() => {
    const scroller = scrollContainer();
    if (!scroller) return;

    const resizeObserver = new ResizeObserver(scheduleRecalculate);
    resizeObserver.observe(scroller);
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    scheduleRecalculate();

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
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
        {activeSwipeId}
        onSwipeOpen={(id) => (activeSwipeId = id)}
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
