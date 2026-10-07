import { Avatar } from "@pinkslip/ui/display";
import type { ReactNode } from "react";
import { initials, type ExampleJob } from "./data";

export function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-32 flex-col pt-14">
      <h2 id={`${id}-title`} className="text-heading">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** One component: its Base UI name, what Pinkslip uses it for, and live demos. */
export function Specimen({ name, use, children }: { name: string; use: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-5 border-b border-line py-8 last:border-b-0">
      <header className="flex flex-col gap-1">
        <h3 className="text-title">{name}</h3>
        <p className="max-w-prose text-meta text-ink-3">{use}</p>
      </header>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </article>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>{children}</div>;
}

export function CompanyMark({ company, size = "md" }: { company: string; size?: "sm" | "md" }) {
  return (
    <Avatar.Root className={size === "sm" ? "size-8" : undefined}>
      <Avatar.Fallback>{initials(company)}</Avatar.Fallback>
    </Avatar.Root>
  );
}

/** The feed row shape, used wherever a demo needs a job. */
export function JobRow({ job, trailing }: { job: ExampleJob; trailing?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <CompanyMark company={job.company} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-ui font-medium text-ink">{job.title}</span>
          <span className="shrink-0 text-meta tabular-nums text-ink-3">{job.posted}</span>
        </div>
        <span className="text-meta text-ink-2">{job.company}</span>
        <span className="text-meta tabular-nums text-ink-3">
          {job.location}
          {job.salary ? `, ${job.salary}` : ""}
        </span>
      </div>
      {trailing}
    </div>
  );
}
