/* Floating layers share one look: a glass surface. Popups that grow from a
   trigger add motion-pop. */
export const surface = "ps-surface rounded-surface outline-none";

export const item =
  "ps-item flex min-h-9 cursor-default select-none items-center gap-2 rounded-item px-2.5 py-1.5 text-ui outline-none data-[disabled]:opacity-45";

export const checkItem =
  "ps-item grid min-h-9 cursor-default select-none grid-cols-[1rem_1fr] items-center gap-2 rounded-item py-1.5 pl-2 pr-3 text-ui outline-none data-[disabled]:opacity-45";

export const itemIndicator = "ps-item-indicator col-start-1 flex";

export const groupLabel = "px-2.5 pb-1 pt-2 text-caption font-medium text-ink-3";

export const separator = "mx-1 my-1 h-px bg-line";
