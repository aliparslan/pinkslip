import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { JobRow, type JobOrigin, type JobRowActions, type JobRowJob } from "./JobRow";
import styles from "./JobList.module.css";

export interface JobListProps {
  jobs: readonly JobRowJob[];
  /** The full result count when the list is a page of a longer one. */
  total?: number;
  label?: string;
  viewed?: ReadonlySet<string>;
  selectedId?: string;
  from?: JobOrigin;
  onOpen?: (job: JobRowJob) => void;
  actions?: JobRowActions;
}

const estimatedRowHeight = 76;

/** `VirtualJobList.svelte` on TanStack Virtual: only rows near the viewport
 * are mounted, measured as they render. The server and the first browser
 * render show every row, so the page has real content before hydration, and
 * focusing into the list mounts every row again so keyboard and screen-reader
 * users can move through all of them. Both modes render the same tree, keyed
 * by job, so switching never remounts a row (or closes its open menu). */
export function JobList({ jobs, total = jobs.length, label = "Jobs", viewed, selectedId, from, onOpen, actions }: JobListProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setMounted(true), []);
  const virtual = mounted && !expanded;

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!virtual || !element) return;
    const measure = () => setScrollMargin(element.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [virtual]);

  const virtualizer = useWindowVirtualizer({
    count: jobs.length,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
    scrollMargin,
    enabled: virtual,
    getItemKey: (index) => jobs[index]?.id ?? index,
  });

  const items = virtual
    ? virtualizer.getVirtualItems().map((item) => ({ index: item.index, start: item.start }))
    : jobs.map((_, index) => ({ index, start: 0 }));
  const offset = virtual ? (items[0]?.start ?? scrollMargin) - scrollMargin : 0;
  const setSize = Math.max(total, jobs.length);

  return <div
    ref={listRef}
    role="list"
    aria-label={label}
    className={styles.root}
    data-virtual={virtual || undefined}
    style={virtual ? { "--list-height": `${virtualizer.getTotalSize()}px` } as CSSProperties : undefined}
    onFocus={() => setExpanded(true)}
  >
    <div className={styles.window} style={virtual ? { "--window-offset": `${offset}px` } as CSSProperties : undefined}>
      {items.map(({ index }) => {
        const job = jobs[index];
        if (!job) return null;
        return <div key={job.id} ref={virtual ? virtualizer.measureElement : undefined} data-index={index}
          role="listitem" aria-posinset={index + 1} aria-setsize={setSize}>
          <JobRow job={job} viewed={viewed?.has(job.id)} selected={job.id === selectedId}
            from={from} onOpen={onOpen} actions={actions} />
        </div>;
      })}
    </div>
  </div>;
}
