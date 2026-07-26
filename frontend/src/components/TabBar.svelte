<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import { hapticLight } from "../lib/haptics";
  import House from "phosphor-svelte/lib/House";
  import UserCircle from "phosphor-svelte/lib/UserCircle";

  let route = $derived($currentRoute);

  const tabs = [
    { label: "Feed", path: "/", icon: House },
    { label: "Profile", path: "/profile", icon: UserCircle },
  ] as const;

  function isActive(path: string): boolean {
    if (path === "/") return route === "/" || route === "";
    return route.startsWith(path);
  }

  function selectTab(path: string): void {
    if (isActive(path)) {
      // Re-tapping the current tab scrolls to top, like native iOS.
      window.scrollTo({ top: 0, behavior: "smooth" });
      hapticLight();
      return;
    }
    hapticLight();
    navigate(path);
  }
</script>

<nav class="tab-bar" aria-label="Main navigation">
  <div class="tab-bar__inner app-container">
    {#each tabs as tab}
      {@const active = isActive(tab.path)}
      <button
        class="tab-bar__item"
        class:active
        onclick={() => selectTab(tab.path)}
        aria-current={active ? "page" : undefined}
      >
        <tab.icon size={22} weight={active ? "fill" : "regular"} />
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .tab-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: color-mix(in oklch, var(--color-bg) 94%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--color-line);
    box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.06);
  }
  .tab-bar__inner {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    padding: 6px 12px calc(env(safe-area-inset-bottom, 0px) + 4px);
  }
  .tab-bar__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink-3);
    font-family: var(--font-sans);
    font-size: var(--fs-2xs);
    font-weight: 500;
    transition: color 0.15s;
  }
  .tab-bar__item.active {
    color: var(--color-ink);
    font-weight: 600;
  }
</style>
