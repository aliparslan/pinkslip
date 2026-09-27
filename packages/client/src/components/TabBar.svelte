<script lang="ts">
  import {
    currentRoute,
    navigate,
    rootDestinationFor,
    routeHref,
    scrollContainer,
    shouldHandleRouteAnchor,
    type RootDestination,
  } from "../router";
  import BrandMark from "./BrandMark.svelte";
  import BookmarksSimple from "phosphor-svelte/lib/BookmarksSimple";
  import Briefcase from "phosphor-svelte/lib/Briefcase";
  import UserCircle from "phosphor-svelte/lib/UserCircle";
  import { prefersReducedMotion } from "../lib/motion";

  let {
    mobileHidden = false,
    activeRouteOverride,
  }: {
    mobileHidden?: boolean;
    activeRouteOverride?: string;
  } = $props();

  let navigationInert = $derived(mobileHidden);

  let route = $derived(activeRouteOverride ?? $currentRoute);

  const tabs = [
    { id: "feed", label: "Jobs", path: "/", icon: Briefcase },
    { id: "library", label: "Library", path: "/library/saved", icon: BookmarksSimple },
    { id: "you", label: "You", path: "/you", icon: UserCircle },
  ] as const;

  function isActive(id: RootDestination): boolean {
    return rootDestinationFor(route) === id;
  }

  function selectTab(event: MouseEvent, path: string, id: RootDestination): void {
    if (!shouldHandleRouteAnchor(event)) return;
    event.preventDefault();
    if (isActive(id)) {
      const reduce = prefersReducedMotion();
      scrollContainer()?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    navigate(path);
  }
</script>

<nav
  class="tab-bar"
  class:mobile-hidden={mobileHidden}
  inert={navigationInert}
  aria-hidden={navigationInert ? "true" : undefined}
  aria-label="Main navigation"
>
  <div class="tab-bar__inner">
    <a href={routeHref("/")} class="tab-bar__brand" aria-label="Go to jobs" onclick={(event) => selectTab(event, "/", "feed")}>
      <span class="tab-bar__mark"><BrandMark size={23} /></span>
      <span><span>pink</span>slip</span>
    </a>

    <div class="tab-bar__links">
    {#each tabs as tab}
      {@const active = isActive(tab.id)}
      <a
        href={routeHref(tab.path)}
        class="tab-bar__item"
        class:active
        onclick={(event) => selectTab(event, tab.path, tab.id)}
        aria-current={active ? "page" : undefined}
      >
        <span class="tab-bar__icon" aria-hidden="true">
          <span class:visible={!active}><tab.icon size={22} weight="regular" /></span>
          <span class:visible={active}><tab.icon size={22} weight="fill" /></span>
        </span>
        <span class="tab-bar__label">{tab.label}</span>
      </a>
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

  :global(html.native-ios) .tab-bar {
    opacity: 1;
    visibility: visible;
  }
  .tab-bar__inner {
    width: 100%;
    max-width: var(--app-mobile-width);
    margin: 0 auto;
  }
  .tab-bar__links {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 0 var(--space-3) var(--safe-bottom);
  }
  .tab-bar__brand {
    display: none;
  }
  .tab-bar__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 9px 0 7px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink-3);
    text-decoration: none;
    font-family: var(--font-sans);
    font-size: var(--fs-3xs);
    font-weight: 500;
    transition:
      color var(--duration-instant) var(--ease-standard),
      background var(--duration-instant) var(--ease-standard),
      transform var(--duration-instant) var(--ease-standard);
  }
  .tab-bar__item:active { transform: scale(0.96); }
  .tab-bar__item.active {
    color: var(--color-accent);
  }

  .tab-bar__label { transform: translateY(-1px); }

  .tab-bar__icon {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
  }

  .tab-bar__icon > span {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    opacity: 0;
  }

  .tab-bar__icon > span.visible {
    opacity: 1;
  }

  @media (max-width: 899px) {
    .tab-bar.mobile-hidden {
      display: none;
    }

    :global(html.native-ios) .tab-bar.mobile-hidden {
      display: none;
    }
  }

</style>
