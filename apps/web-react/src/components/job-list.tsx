import type { ReactNode } from "react";

/** A list of job rows: full-bleed on phones, framed on wider screens. Rows
 * take the color of the page under them.
 * Hairlines between rows start after the company mark, as in a native list. */
export function JobList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 sm:mx-0 sm:overflow-hidden sm:rounded-surface sm:border sm:border-line"
    >
      {children}
    </ul>
  );
}

/** One row's place in the list. While `leaving`, the row slides away and the
 * gap closes; clearing it (Undo) brings the row back the same way. */
export function JobListItem({ leaving = false, children }: { leaving?: boolean; children: ReactNode }) {
  return (
    <li
      data-leaving={leaving || undefined}
      inert={leaving || undefined}
      className="motion-dismiss relative before:absolute before:left-17 before:right-0 before:top-0 before:z-10 before:h-px before:bg-line first:before:hidden"
    >
      {children}
    </li>
  );
}
