import { writable } from "svelte/store";

/** Whether the search bar is visible on the feed page. Toggled from the header. */
export const searchOpen = writable(false);

/** Number of unviewed jobs in the feed. Drives the bell badge in the header. */
export const unviewedCount = writable(0);
