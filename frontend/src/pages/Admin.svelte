<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { sessionAccess } from "../lib/session-access";
  import { feedback } from "../lib/feedback.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import AdminSection from "./profile/AdminSection.svelte";
  import Companies from "./Companies.svelte";

  const destinations = [
    { path: "/admin", label: "Overview" },
    { path: "/admin/inbox", label: "Inbox" },
    { path: "/admin/sources", label: "Sources" },
    { path: "/admin/runs", label: "Runs" },
  ] as const;

  let route = $derived($currentRoute);
  let active = $derived(destinations.find((destination) => destination.path === route) ?? destinations[0]);
  let sectionView = $derived<"overview" | "inbox" | "runs">(
    route === "/admin/inbox" ? "inbox" : route === "/admin/runs" ? "runs" : "overview"
  );

  function backToYou() {
    if (!requestBack()) navigate("/you");
  }
</script>

<div class="page pushed-screen">
  <ScreenNav title="Admin workspace" backLabel="Back to You" onBack={backToYou} />

  {#if !$sessionAccess.isAdmin}
    <div class="admin-denied">
      <h1 class="h-display h-display-sm">Admin access required</h1>
      <p>This area is only available to Pinkslip administrators.</p>
      <button class="btn-secondary" type="button" onclick={backToYou}>Back to You</button>
    </div>
  {:else}
    <div class="admin-page">
      <nav class="admin-tabs" aria-label="Admin workspace sections">
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

      <main class="admin-view" aria-label={active.label}>
        {#if route === "/admin/sources"}
          <div class="admin-source-embed"><Companies mode="admin" /></div>
        {:else}
          <AdminSection
            view={sectionView}
            onError={(message) => feedback.error(message)}
            onSuccess={(message) => feedback.success(message)}
          />
        {/if}
      </main>
    </div>
  {/if}
</div>

<style>
  .admin-page {
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

  .admin-tabs button.active {
    background: var(--color-bg-elev);
    color: var(--color-ink);
    box-shadow: var(--shadow-control-active);
  }

  .admin-view {
    display: flex;
    flex-direction: column;
    gap: 28px;
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
