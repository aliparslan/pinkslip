<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import { hapticLight } from "../lib/haptics";
  import CardsThree from "phosphor-svelte/lib/CardsThree";
  import UserCircle from "phosphor-svelte/lib/UserCircle";

  let { mobileHidden = false }: { mobileHidden?: boolean } = $props();

  let route = $derived($currentRoute);

  const tabs = [
    { label: "Feed", path: "/", icon: CardsThree },
    { label: "You", path: "/you", icon: UserCircle },
  ] as const;

  function isActive(path: string): boolean {
    if (path === "/") {
      return route === "/"
        || route === ""
        || route.startsWith("/jobs/")
        || route.startsWith("/tailor/");
    }
    if (path === "/you") {
      return route === "/you"
        || route === "/profile"
        || route === "/settings"
        || route.startsWith("/you/")
        || route.startsWith("/my-jobs/")
        || route === "/companies"
        || route === "/resume"
        || route === "/corpus";
    }
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

<nav class="tab-bar" class:mobile-hidden={mobileHidden} aria-label="Main navigation">
  <div class="tab-bar__inner">
    <button class="tab-bar__brand" aria-label="Go to feed" onclick={() => selectTab("/")}>
      <svg class="tab-bar__mark" width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" />
        <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.52" />
        <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.52" />
        <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.52" />
      </svg>
      <span><span>pink</span>slip</span>
    </button>

    <div class="tab-bar__links">
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
    box-shadow: none;
  }
  .tab-bar__inner {
    width: 100%;
    max-width: var(--app-mobile-width);
    margin: 0 auto;
  }
  .tab-bar__links {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    padding: 6px 12px calc(env(safe-area-inset-bottom, 0px) + 4px);
  }
  .tab-bar__brand {
    display: none;
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
    color: var(--color-accent);
    font-weight: 600;
  }

  @media (max-width: 899px) {
    .tab-bar.mobile-hidden {
      display: none;
    }
  }

  @media (min-width: 900px) {
    .tab-bar {
      top: 0;
      right: auto;
      width: var(--app-nav-wide);
      padding: 28px 16px;
      border-top: 0;
      border-right: 1px solid var(--color-line);
      background: var(--color-bg-elev);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .tab-bar__inner {
      max-width: none;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .tab-bar__brand {
      min-height: var(--tap-min);
      padding: 6px 8px;
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: 10px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-ink);
      font-size: var(--fs-xl);
      font-weight: 750;
      letter-spacing: -0.02em;
      cursor: pointer;
    }
    .tab-bar__brand > span > span {
      color: var(--color-accent);
    }
    .tab-bar__mark {
      flex-shrink: 0;
      transform: rotate(-8deg);
    }
    .tab-bar__links {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0;
    }
    .tab-bar__item {
      min-height: 48px;
      padding: 0 12px;
      flex-direction: row;
      justify-content: flex-start;
      gap: 12px;
      border-radius: var(--radius-md);
      font-size: var(--fs-base);
    }
    .tab-bar__item.active {
      background: var(--color-accent-soft);
      color: var(--color-accent-soft-ink);
    }
  }
</style>
