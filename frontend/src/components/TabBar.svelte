<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import House from "phosphor-svelte/lib/House";
  import Notepad from "phosphor-svelte/lib/Notepad";
  import Ticket from "phosphor-svelte/lib/Ticket";
  import UserCircle from "phosphor-svelte/lib/UserCircle";

  let route = $derived($currentRoute);

  const tabs = [
    { label: "Feed", path: "/", icon: House },
    { label: "Tracker", path: "/tracker", icon: Notepad },
    { label: "Events", path: "/events", icon: Ticket },
    { label: "Profile", path: "/profile", icon: UserCircle },
  ] as const;

  function isActive(path: string): boolean {
    if (path === "/") return route === "/" || route === "";
    return route.startsWith(path);
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-40" style="background: color-mix(in oklch, var(--color-bg) 94%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid var(--color-line); box-shadow: 0 -1px 3px rgba(0,0,0,0.06);">
  <div class="grid grid-cols-4" style="padding: 8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px);">
    {#each tabs as tab}
      {@const active = isActive(tab.path)}
      <button
        class="flex flex-col items-center gap-1 py-1.5 transition-colors"
        style="color: {active ? 'var(--color-ink)' : 'var(--color-ink-3)'}; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500;"
        onclick={() => navigate(tab.path)}
      >
        <tab.icon size={22} weight={active ? "fill" : "regular"} />
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>
