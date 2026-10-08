import type { Job } from "@pinkslip/core/api";
import { formatRowLocation, formatRowSalary } from "@pinkslip/core/job-format";
import { compactJobAge, isFreshJobTiming } from "@pinkslip/core/job-timing";
import { timeAgo } from "@pinkslip/core/utils";
import { Button } from "@pinkslip/ui/button";
import { Tooltip } from "@pinkslip/ui/floating";
import { BookmarkIcon, HideIcon, MoreIcon } from "@pinkslip/ui/icons";
import { cn } from "@pinkslip/ui/lib/cn";
import { Skeleton } from "@pinkslip/ui/loading";
import { ContextMenu, Menu, menuItemDanger } from "@pinkslip/ui/menu";
import { Toggle } from "@pinkslip/ui/toggle";
import { Fragment, type ComponentType, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { CompanyMark } from "./company-mark";

export interface JobRowActions {
  onSavedChange?: (saved: boolean) => void;
  /** Only offered for a job you've opened. */
  onMarkUnread?: () => void;
  onMarkApplied?: () => void;
  onHide?: () => void;
  onHideCompany?: () => void;
  onReport?: () => void;
  /** Admins only: removes the listing for everyone. */
  onBlock?: () => void;
}

export interface JobRowProps extends JobRowActions {
  job: Job;
  /** Where the row leads, usually the job's page. */
  href: string;
  logoSrc?: string;
  /** Opened before: the title quiets down and the new dot goes away. */
  viewed?: boolean;
  /** Open beside the list, on wide screens. */
  selected?: boolean;
  /** In the Applied list the status is when you applied, not when it posted. */
  timing?: "posted" | "applied";
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/* Two lines beside the company mark, the three exactly as tall as each other:
   the title, then company, place, and pay. The right edge is status: how old
   the job is, and a bookmark when it's saved.

   Actions never take a column. On a pointer, hovering fades Save, Hide, and
   More in over the status; right-click opens every action. On touch, a long
   press opens the same menu (the iOS app adds swipes). */
export function JobRow({
  job,
  href,
  logoSrc,
  viewed = false,
  selected = false,
  timing = "posted",
  onOpen,
  ...actions
}: JobRowProps) {
  const closed = Boolean(job.closed_at);
  const saved = Boolean(job.saved);
  const fresh = !viewed && !closed && isFreshJobTiming(job);
  const status = closed
    ? "Closed"
    : timing === "applied" && job.applied_at
      ? `Applied ${timeAgo(job.applied_at).replace(/ ago$/, "")}`
      : compactJobAge(job);
  const location = formatRowLocation(job.location);
  const salary = formatRowSalary(job.salary);
  // Where space runs out, the place shortens first, then the company. Pay
  // never does.
  const details = [
    <span key="company" className="max-w-1/2 shrink-0 truncate font-medium text-ink-2">
      {job.company_name}
    </span>,
    location ? (
      <span key="location" className="min-w-0 truncate text-ink-3">
        {location}
      </span>
    ) : null,
    salary ? (
      <span key="salary" className="shrink-0 tabular-nums text-ink-2">
        {salary}
      </span>
    ) : null,
  ].filter(Boolean);
  const hasActions = Object.values(actions).some(Boolean);

  return (
    <ContextMenu.Root disabled={!hasActions}>
      <ContextMenu.Trigger
        data-selected={selected || undefined}
        className="ps-row group relative flex items-center gap-3 px-4 py-2.5"
      >
        <span className="relative flex shrink-0">
          <CompanyMark name={job.company_name} src={logoSrc} />
          {fresh ? (
            <span className="ps-new-dot absolute -right-1 -top-1 size-2.5 rounded-pill" aria-hidden="true" />
          ) : null}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <a
              href={href}
              title={job.title}
              onClick={onOpen}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "ps-row-link min-w-0 truncate text-ui leading-5 after:absolute after:inset-0",
                closed ? "text-ink-3" : viewed ? "text-ink-2" : "font-medium text-ink",
              )}
            >
              {fresh ? <span className="sr-only">New: </span> : null}
              {job.title}
            </a>
            {status ? <span className="ml-auto shrink-0 text-meta tabular-nums text-ink-3">{status}</span> : null}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-meta">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {details.map((item, index) => (
                <Fragment key={index}>
                  {index > 0 ? (
                    <span className="shrink-0 text-ink-3" aria-hidden="true">
                      ·
                    </span>
                  ) : null}
                  {item}
                </Fragment>
              ))}
            </span>
            {saved ? (
              <span className="flex shrink-0 text-accent-text" role="img" aria-label="Saved">
                <BookmarkIcon size={12} fill="currentColor" strokeWidth={1.4} />
              </span>
            ) : null}
          </div>
        </div>
        {hasActions ? <HoverActions job={job} saved={saved} actions={actions} /> : null}
      </ContextMenu.Trigger>
      {hasActions ? (
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup>
              <JobActionItems
                job={job}
                saved={saved}
                actions={actions}
                Item={ContextMenu.Item}
                Separator={ContextMenu.Separator}
              />
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  );
}

/** Save, Hide, and More, faded in over the status on hover or keyboard
 * focus. Hidden on touch, where a long press opens the menu instead. */
function HoverActions({ job, saved, actions }: { job: Job; saved: boolean; actions: JobRowActions }) {
  return (
    <div className="ps-row-actions absolute inset-y-0 right-0 z-10 flex items-center gap-0.5 pl-8 pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:hidden">
      {actions.onSavedChange ? (
        <Tip label={saved ? "Remove from saved" : "Save"}>
          <Toggle
            size="icon-sm"
            pressed={saved}
            onPressedChange={actions.onSavedChange}
            aria-label={saved ? `Saved: ${job.title}` : `Save ${job.title}`}
            className="ps-pop"
          >
            <BookmarkIcon size={15} className="ps-pop-icon" fill={saved ? "currentColor" : "none"} />
          </Toggle>
        </Tip>
      ) : null}
      {actions.onHide ? (
        <Tip label="Hide this job">
          <Button variant="ghost" size="icon-sm" onClick={actions.onHide} aria-label={`Hide ${job.title}`}>
            <HideIcon size={15} />
          </Button>
        </Tip>
      ) : null}
      <Menu.Root>
        <Menu.Trigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${job.title}`} />}>
          <MoreIcon size={15} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4}>
            <Menu.Popup>
              <JobActionItems job={job} saved={saved} actions={actions} Item={Menu.Item} Separator={Menu.Separator} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Every action on a job, in one order, for both the More menu and the
 * right-click or long-press menu. */
function JobActionItems({
  job,
  saved,
  actions,
  Item,
  Separator,
}: {
  job: Job;
  saved: boolean;
  actions: JobRowActions;
  Item: ComponentType<{ onClick?: () => void; className?: string; children: ReactNode }>;
  Separator: ComponentType;
}) {
  const { onSavedChange, onMarkUnread, onMarkApplied, onHide, onHideCompany, onReport, onBlock } = actions;
  return (
    <>
      {onSavedChange ? <Item onClick={() => onSavedChange(!saved)}>{saved ? "Remove from saved" : "Save"}</Item> : null}
      {onMarkUnread ? <Item onClick={onMarkUnread}>Mark as unread</Item> : null}
      {onMarkApplied ? <Item onClick={onMarkApplied}>Mark as applied</Item> : null}
      {onHide || onHideCompany ? <Separator /> : null}
      {onHide ? <Item onClick={onHide}>Hide this job</Item> : null}
      {onHideCompany ? <Item onClick={onHideCompany}>Hide all {job.company_name} jobs</Item> : null}
      {onReport || onBlock ? <Separator /> : null}
      {onReport ? <Item onClick={onReport}>Report listing</Item> : null}
      {onBlock ? (
        <Item onClick={onBlock} className={menuItemDanger}>
          Block for everyone
        </Item>
      ) : null}
    </>
  );
}

/** The row's shape while jobs load: same size, so nothing jumps when they
 * arrive. */
export function JobRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" aria-hidden="true">
      <Skeleton className="size-10 shrink-0 rounded-control" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
