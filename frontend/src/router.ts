import { writable, derived } from "svelte/store";

const hash = writable(window.location.hash.slice(1) || "/");

window.addEventListener("hashchange", () => {
  hash.set(window.location.hash.slice(1) || "/");
});

export const currentRoute = derived(hash, ($hash) => $hash || "/");

export function navigate(path: string) {
  window.location.hash = path;
}
