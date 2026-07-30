<script lang="ts">
  import { currentRoute, navigate, rootDestinationFor, type RootDestination } from "../router";
  import { hapticLight } from "../lib/haptics";
  import BrandMark from "./BrandMark.svelte";
  import Briefcase from "phosphor-svelte/lib/Briefcase";
  import CardsThree from "phosphor-svelte/lib/CardsThree";
  import UserCircle from "phosphor-svelte/lib/UserCircle";

  let { mobileHidden = false }: { mobileHidden?: boolean } = $props();

  let route = $derived($currentRoute);

  const tabs = [
    { id: "feed", label: "Feed", path: "/", icon: CardsThree },
    { id: "library", label: "Library", path: "/library/saved", icon: Briefcase },
    { id: "you", label: "You", path: "/you", icon: UserCircle },
  ] as const;

  function isActive(id: RootDestination): boolean {
    return rootDestinationFor(route) === id;
  }

  function selectTab(path: string, id: RootDestination): void {
    if (isActive(id)) {
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
    <button type="button" class="tab-bar__brand" aria-label="Go to feed" onclick={() => selectTab("/", "feed")}>
      <span class="tab-bar__mark"><BrandMark size={23} /></span>
      <span><span>pink</span>slip</span>
    </button>

    <div class="tab-bar__links">
    {#each tabs as tab}
      {@const active = isActive(tab.id)}
      <button
        type="button"
        class="tab-bar__item"
        class:active
        onclick={() => selectTab(tab.path, tab.id)}
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
    z-index: var(--z-navigation);
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
    grid-template-columns: repeat(3, 1fr);
    padding: var(--space-1) var(--space-3) max(0px, calc(env(safe-area-inset-bottom, 0px) - 4px));
  }
  .tab-bar__brand {
    display: none;
  }
  .tab-bar__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: 6px 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink-3);
    font-family: var(--font-sans);
    font-size: var(--fs-2xs);
    font-weight: 500;
    transition:
      color var(--duration-instant) var(--ease-standard),
      background var(--duration-instant) var(--ease-standard);
  }
  .tab-bar__item.active {
    color: var(--color-accent);
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
      padding: 28px var(--space-4);
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
      padding: 6px var(--space-2);
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: 10px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-ink);
      font-size: var(--fs-xl);
      font-weight: 600;
      letter-spacing: -0.02em;
      cursor: pointer;
    }
    .tab-bar__brand > span > span {
      color: var(--color-accent);
    }
    .tab-bar__mark {
      display: block;
      flex-shrink: 0;
      transform: rotate(-5deg);
    }
    .tab-bar__links {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: 0;
    }
    .tab-bar__item {
      min-height: 48px;
      padding: 0 var(--space-3);
      flex-direction: row;
      justify-content: flex-start;
      gap: var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--fs-base);
    }
    .tab-bar__item.active {
      background: var(--color-accent-soft);
      color: var(--color-accent-soft-ink);
    }
  }
</style>
