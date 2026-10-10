import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookmarkSimple, DotsThreeVertical, EnvelopeOpen, EnvelopeSimple, EyeSlash, Prohibit } from "@phosphor-icons/react";
import type { Job } from "@pinkslip/core/api";
import { formatCompactSalaryText, formatJobLocation } from "@pinkslip/core/job-format";
import { isFreshJobTiming, jobTimingLabel } from "@pinkslip/core/job-timing";
import { Menu, MenuItem, MenuSeparator } from "../../kit";
import { CompanyLogo } from "./CompanyLogo";
import { extractSalaryFromHtml } from "./job-content";
import styles from "./JobRow.module.css";

/** What a row needs. Public catalog summaries fit, and personal feed jobs add
 * the match reason, source type and saved state. */
export type JobRowJob = Pick<Job, "id" | "title" | "company_name" | "company_domain" | "location" | "salary"
  | "posted_at" | "first_seen_at" | "evergreen">
  & Partial<Pick<Job, "description" | "source_type" | "match_fact" | "saved">>;

export type JobOrigin = "library-saved" | "library-applied";

/** Row actions. Each is optional; the menu shows only what the owner wires. */
export interface JobRowActions {
  onSave?: (job: JobRowJob) => void;
  onToggleRead?: (job: JobRowJob, viewed: boolean) => void;
  onHide?: (job: JobRowJob) => void;
  /** Admin only: remove the job for everyone (the owner confirms first). */
  onBlock?: (job: JobRowJob) => void;
}

export interface JobRowProps {
  job: JobRowJob;
  viewed?: boolean;
  /** The job open beside the list on wide screens. */
  selected?: boolean;
  /** Replaces the timing label, e.g. "Applied 3d ago" in Library. */
  contextLabel?: string;
  /** Library rows return to their tab from the job's Back. */
  from?: JobOrigin;
  /** Called when the row is opened (marks it read). */
  onOpen?: (job: JobRowJob) => void;
  actions?: JobRowActions;
}

const exitMs = 160;

/** `JobRow.svelte` for the web: logo, company and timing, title, location and
 * salary, the match reason, and an actions menu. Read rows are dimmed; a fresh
 * unread job gets the pink "new" dot. The iOS swipe actions belong to the
 * native app (Phase 6). */
export function JobRow({ job, viewed = false, selected, contextLabel, from, onOpen, actions = {} }: JobRowProps) {
  const [leaving, setLeaving] = useState(false);
  const location = formatJobLocation(job.location);
  const salary = formatCompactSalaryText(job.salary?.trim() ? job.salary : extractSalaryFromHtml(job.description ?? null));
  const fresh = !contextLabel && !viewed && isFreshJobTiming(job);
  const saved = Boolean(job.saved);
  const { onSave, onToggleRead, onHide, onBlock } = actions;
  const hasMenu = Boolean((onSave && !saved) || onToggleRead || onHide || onBlock);

  const hide = () => {
    if (!onHide) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onHide(job);
      return;
    }
    setLeaving(true);
    window.setTimeout(() => onHide(job), exitMs);
  };

  return <div className={styles.root} data-leaving={leaving || undefined}>
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      search={from ? { from } : {}}
      className={styles.link}
      data-viewed={viewed || undefined}
      data-has-menu={hasMenu || undefined}
      data-job-id={job.id}
      aria-current={selected ? "page" : undefined}
      onClick={() => onOpen?.(job)}
    >
      <CompanyLogo name={job.company_name} domain={job.company_domain} size={24} />
      <span className={styles.body}>
        <span className={styles.meta}>
          <span className={styles.company} title={job.company_name}>{job.company_name}</span>
          <span className={styles.dot} aria-hidden>·</span>
          {/* Relative times can differ by a minute between server and browser. */}
          <span className={styles.time} suppressHydrationWarning>{contextLabel ?? jobTimingLabel(job)}</span>
          {fresh && <span className={styles.new} role="img" aria-label="New job" />}
        </span>
        <span className={styles.title}>{job.title}</span>
        {(location || salary) && <span className={styles.sub}>
          {location && <span className={styles.location}>{location}</span>}
          {location && salary && <span className={styles.dot} aria-hidden>·</span>}
          {salary && <span className={styles.salary}>{salary}</span>}
        </span>}
        {job.match_fact && <span className={styles.reason}>{job.match_fact}</span>}
      </span>
    </Link>
    {hasMenu && <div className={styles.accessory}>
      <Menu trigger={{ icon: DotsThreeVertical, label: `Actions for ${job.title} at ${job.company_name}`, size: "sm", iconSize: 18 }}>
        {onSave && !saved && <MenuItem icon={BookmarkSimple} onSelect={() => onSave(job)}>Save</MenuItem>}
        {onToggleRead && <MenuItem icon={viewed ? EnvelopeSimple : EnvelopeOpen} onSelect={() => onToggleRead(job, !viewed)}>
          {viewed ? "Mark as unread" : "Mark as read"}
        </MenuItem>}
        {onHide && <MenuItem icon={EyeSlash} onSelect={hide}>Hide</MenuItem>}
        {onBlock && <>
          <MenuSeparator />
          <MenuItem icon={Prohibit} tone="danger" onSelect={() => onBlock(job)}>Block for everyone</MenuItem>
        </>}
      </Menu>
    </div>}
  </div>;
}
