<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { sessionAccess } from "../lib/session-access";
  import { feedback } from "../lib/feedback.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import AdminSection from "./profile/AdminSection.svelte";
  import InboxSection from "./profile/InboxSection.svelte";
  import RunsSection from "./profile/RunsSection.svelte";
  import Companies from "./Companies.svelte";
  import { isIosApp } from "../lib/platform";

  const nativeIos = isIosApp();
  const destinations = [
    { path: "/admin", label: nativeIos ? "Manage" : "Manage app" },
    { path: "/admin/inbox", label: "Inbox" },
    { path: "/admin/sources", label: "Sources" },
    { path: "/admin/runs", label: "Runs" },
  ] as const;

  let route = $derived($currentRoute);
  let active = $derived(destinations.find((destination) => destination.path === route) ?? destinations[0]);

  function backToYou() {
    if (!requestBack()) navigate("/you");
  }
</script>

<div class="page pushed-screen" class:native-layout={nativeIos}>
  <ScreenNav
    title={nativeIos ? "Admin" : "Admin workspace"}
    collapsible={nativeIos}
    searchable={nativeIos && route === "/admin/sources"}
    chromeOwnerId="sources"
    backLabel="Back to You"
    onBack={backToYou}
  />

  {#if !$sessionAccess.isAdmin}
    <div class="admin-denied">
      <h1 class="h-display h-display-sm">Admin access required</h1>
      <p>This area is only available to Pinkslip administrators.</p>
      <button class="btn-secondary" type="button" onclick={backToYou}>Back to You</button>
    </div>
  {:else}
    <div class="admin-page">
      <h1 class="admin-view-title" data-screen-title-anchor>Admin</h1>

      <nav
        class="admin-tabs"
        class:inbox-active={active.path === "/admin/inbox"}
        class:sources-active={active.path === "/admin/sources"}
        class:runs-active={active.path === "/admin/runs"}
        aria-label="Admin sections"
      >
        {#each destinations as destination}
          <button
            type="button"
            class:active={active.path === destination.path}
            aria-current={active.path === destination.path ? "page" : undefined}
            onclick={() => navigate(destination.path)}
          >
            {destination.label}
          </button>
        {/each}
      </nav>

      <section class="admin-view" aria-label={active.label}>
        {#if route === "/admin/sources"}
          <div class="admin-source-embed"><Companies mode="admin" embedded /></div>
        {:else if route === "/admin/inbox"}
          <InboxSection
            {nativeIos}
            onError={(message) => feedback.error(message)}
            onSuccess={(message) => feedback.success(message)}
          />
        {:else if route === "/admin/runs"}
          <RunsSection
            {nativeIos}
            onError={(message) => feedback.error(message)}
            onSuccess={(message) => feedback.success(message)}
          />
        {:else}
          <AdminSection
            {nativeIos}
            onError={(message) => feedback.error(message)}
          />
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .admin-page {
    --admin-section-gap: 28px;

    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: 12px var(--screen-gutter) 48px;
  }

  .admin-tabs {
    height: 42px;
    margin-bottom: 22px;
    padding: 3px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }

  .native-layout .admin-tabs {
    position: relative;
    isolation: isolate;
    height: 50px;
    margin-bottom: var(--space-4);
  }

  .native-layout .admin-tabs::before {
    content: "";
    position: absolute;
    z-index: 0;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 15px) / 4);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elev);
    box-shadow: var(--shadow-control-active);
    transition: transform var(--duration-standard) var(--ease-standard);
  }

  .native-layout .admin-tabs.inbox-active::before {
    transform: translateX(calc(100% + 3px));
  }

  .native-layout .admin-tabs.sources-active::before {
    transform: translateX(calc(200% + 6px));
  }

  .native-layout .admin-tabs.runs-active::before {
    transform: translateX(calc(300% + 9px));
  }

  .admin-tabs button {
    min-width: 0;
    padding: 0 8px;
    overflow: hidden;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .native-layout .admin-tabs button {
    position: relative;
    z-index: 1;
    color: var(--color-ink-2);
    font-weight: 500;
    transition: color var(--duration-instant) var(--ease-standard);
  }

  .admin-tabs button.active {
    background: var(--color-bg-elev);
    color: var(--color-ink);
    box-shadow: var(--shadow-control-active);
  }

  .native-layout .admin-tabs button.active {
    background: transparent;
    color: var(--color-ink);
    box-shadow: none;
  }

  .admin-view-title {
    display: none;
  }

  .native-layout .admin-view-title {
    margin: 0 0 var(--space-6);
    display: block;
    color: var(--color-ink);
    font-family: var(--font-heading);
    font-size: var(--fs-4xl);
    font-weight: 600;
    letter-spacing: var(--tracking-screen-title);
    line-height: var(--leading-screen-title);
    text-wrap: balance;
  }

  .admin-view {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .admin-page :global(.admin-section + .admin-section) {
    margin-top: var(--admin-section-gap);
  }

  .admin-page :global(.admin-section-heading) {
    min-height: 24px;
    margin-bottom: 9px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .admin-page :global(.admin-section-heading h2) {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }

  .admin-page :global(.admin-section-heading span) {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .native-layout .admin-page :global(.surface-list) {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .native-layout .admin-page {
    --admin-section-gap: var(--space-8);
  }

  .native-layout .admin-view {
    gap: 0;
  }

  .native-layout .admin-page :global(.admin-section-heading) {
    margin-bottom: var(--space-3);
  }

  .native-layout .admin-page :global(.metric-summary) {
    overflow: visible;
    display: grid;
    gap: var(--space-3);
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .native-layout .admin-page :global(.metric-group) {
    padding: var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }

  .native-layout :global(.metric-group + .metric-group) {
    border-top: 0;
  }

  .native-layout :global(.metric-group:nth-child(even)) {
    border-left: 0;
  }

  .native-layout :global(.metric-group:nth-child(n + 3)) {
    border-top: 0;
  }

  .native-layout .admin-page :global(.metric-group h3) {
    margin-bottom: var(--space-3);
    color: var(--color-ink-2);
  }

  .native-layout .admin-page :global(.metric-group dl) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--space-4);
  }

  .native-layout .admin-page :global(.metric-group dl > div) {
    min-height: 0;
    display: grid;
    align-content: start;
    justify-content: initial;
    gap: var(--space-1);
  }

  .native-layout .admin-page :global(.metric-group dt) {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1.3;
  }

  .native-layout .admin-page :global(.metric-group dd) {
    font-size: var(--fs-lg);
    line-height: 1.15;
    text-align: left;
  }

  .native-layout .admin-page :global(.list-entry),
  .native-layout .admin-page :global(.review-pagination),
  .native-layout .admin-page :global(.run-row) {
    padding-inline: 0;
  }

  .native-layout .admin-page :global(.run-operation) {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }

  .native-layout .admin-page :global(.run-issue-more summary) {
    min-height: 44px;
  }

  .admin-denied {
    width: min(100%, 520px);
    margin: 0 auto;
    padding: 64px var(--screen-gutter);
    text-align: center;
  }

  .admin-denied p {
    margin: 8px 0 18px;
    color: var(--color-ink-3);
  }

  :global(.admin-source-embed > .page) { min-height: auto; }
  :global(.admin-source-embed .screen-nav) { display: none; }
  :global(.admin-source-embed .companies-page) {
    width: 100%;
    max-width: none;
    padding: 0;
  }

  @media (min-width: 720px) {
    .admin-page { padding-top: 20px; }
    .admin-tabs { width: max-content; min-width: 420px; }
  }
</style>
