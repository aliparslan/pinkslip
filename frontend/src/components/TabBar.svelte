<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import House from "phosphor-svelte/lib/House";
  import Notepad from "phosphor-svelte/lib/Notepad";
  import CalendarDots from "phosphor-svelte/lib/CalendarDots";
  import UserCircle from "phosphor-svelte/lib/UserCircle";

  let route = $derived($currentRoute);

  const tabs = [
    { label: "Feed", path: "/", icon: House },
    { label: "Tracker", path: "/tracker", icon: Notepad },
    { label: "Events", path: "/events", icon: CalendarDots },
    { label: "Profile", path: "/profile", icon: UserCircle },
  ] as const;

  function isActive(path: string): boolean {
    if (path === "/") return route === "/" || route === "";
    return route.startsWith(path);
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-40" aria-label="Main navigation" style="background: color-mix(in oklch, var(--color-bg) 94%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid var(--color-line); box-shadow: 0 -1px 3px rgba(0,0,0,0.06);">
  <div class="app-container grid grid-cols-4" style="padding: 7px 12px calc(env(safe-area-inset-bottom, 0px) + 8px);">
    {#each tabs as tab}
      {@const active = isActive(tab.path)}
      <button
        class="flex flex-col items-center gap-1 py-1.5 transition-colors"
        style="color: {active ? 'var(--color-ink)' : 'var(--color-ink-3)'}; font-family: var(--font-sans); font-size: 11px; font-weight: {active ? '600' : '500'}; border-radius: 12px; background: transparent;"
        onclick={() => navigate(tab.path)}
        aria-current={active ? "page" : undefined}
      >
        <tab.icon size={22} weight={active ? "fill" : "regular"} />
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>
