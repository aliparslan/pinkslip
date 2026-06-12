<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import CompanyLogo from "../components/CompanyLogo.svelte";
  import Modal from "../components/Modal.svelte";
  import CalendarBlank from "phosphor-svelte/lib/CalendarBlank";
  import Plus from "phosphor-svelte/lib/Plus";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Trash from "phosphor-svelte/lib/Trash";
  import Spinner from "../components/Spinner.svelte";

  type EventItem = {
    id: string;
    company_id: string | null;
    company_name: string | null;
    title: string;
    description: string;
    event_type: string;
    event_date: string;
    location: string;
    url: string;
  };

  let events: EventItem[] = $state([]);
  let loading: boolean = $state(true);
  let loadError: string | null = $state(null);
  let showCreate: boolean = $state(false);
  let creating: boolean = $state(false);
  let formError: string | null = $state(null);
  let deleteTarget: EventItem | null = $state(null);
  let deleting: boolean = $state(false);

  // Form fields
  let createTitle: string = $state("");
  let createCompanyText: string = $state("");
  let createDate: string = $state("");
  let createTime: string = $state("");
  let createUrl: string = $state("");
  let createType: string = $state("call");
  let createLocation: string = $state("");

  let companies: { id: string; name: string; website: string }[] = $state([]);

  // Resolve typed company text to a company_id or custom name
  let resolvedCompany = $derived.by(() => {
    const text = createCompanyText.trim();
    if (!text) return { company_id: undefined, company_name: undefined };
    const match = companies.find((c) => c.name.toLowerCase() === text.toLowerCase());
    if (match) return { company_id: match.id, company_name: undefined };
    return { company_id: undefined, company_name: text };
  });

  // Group events by day. Dates outside the current year include the year so
  // far-out deadlines can't collide with this year's labels.
  let grouped = $derived.by(() => {
    const g: Record<string, EventItem[]> = {};
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const e of events) {
      const d = new Date(e.event_date);

      let label: string;
      if (d.toDateString() === today.toDateString()) label = "Today";
      else if (d.toDateString() === tomorrow.toDateString()) label = "Tomorrow";
      else {
        label = d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
        });
      }

      if (!g[label]) g[label] = [];
      g[label].push(e);
    }
    return g;
  });

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  async function loadEvents() {
    loading = true;
    loadError = null;
    try {
      const res = await api.events.list({ upcoming: "true" });
      events = (res.events ?? []) as EventItem[];
    } catch (e) {
      // Surface load failures instead of rendering them as an empty list.
      loadError = errorMessage(e, "Couldn't load your events.");
    } finally {
      loading = false;
    }
  }

  async function loadCompanies() {
    try {
      const res = await api.companies.list();
      companies = (res.companies ?? [])
        .filter((c) => c.enabled)
        .map((c) => ({ id: c.id, name: c.name, website: c.website }));
    } catch {
      companies = [];
    }
  }

  async function handleCreate() {
    if (!createTitle.trim() || !createDate || creating) return;
    creating = true;
    formError = null;
    try {
      const eventDate = createTime
        ? `${createDate}T${createTime}:00`
        : `${createDate}T00:00:00`;

      const created = await api.events.create({
        title: createTitle.trim(),
        company_id: resolvedCompany.company_id,
        company_name: resolvedCompany.company_name,
        event_date: eventDate,
        event_type: createType,
        url: createUrl.trim() || undefined,
        location: createLocation.trim() || undefined,
      });
      events = [...events, created as EventItem].sort(
        (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      );
      showCreate = false;
      createTitle = "";
      createCompanyText = "";
      createDate = "";
      createTime = "";
      createUrl = "";
      createType = "call";
      createLocation = "";
    } catch (e) {
      formError = errorMessage(e);
    } finally {
      creating = false;
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    deleting = true;
    const target = deleteTarget;
    events = events.filter((e) => e.id !== target.id);
    try {
      await api.events.delete(target.id);
      deleteTarget = null;
    } catch {
      loadEvents();
      deleteTarget = null;
    } finally {
      deleting = false;
    }
  }

  onMount(() => {
    loadEvents();
    loadCompanies();
  });
</script>

<div class="page" style="padding-top: 0;">
  <div class="page-frame" style="padding-bottom: 8px;">
    <div class="page-hero">
      <div class="page-hero-copy">
        <h1 class="h-display h-display-lg">
          Events
        </h1>
        <p class="page-subtitle">
          Recruiter calls, onsites, and deadlines in one calmer timeline.
        </p>
      </div>
      <button
        class="btn-secondary"
        style="height: 40px; padding: 0 12px; font-size: var(--fs-xs);"
        onclick={() => showCreate = true}
      >
        <Plus size={14} />
        Add
      </button>
    </div>
    <div class="stat-row">
      <span><strong style="color: var(--color-ink);">{events.length}</strong> scheduled</span>
    </div>
  </div>

  {#if loading}
    <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
  {:else if loadError}
    <div style="text-align: center; padding: 48px 24px;">
      <h2 class="h-display h-display-sm" style="color: var(--color-ink-2); margin-bottom: 8px;">
        Couldn't load events
      </h2>
      <div style="font-size: var(--fs-sm); color: var(--color-ink-3); line-height: 1.5; max-width: 280px; margin: 0 auto 16px;">
        {loadError}
      </div>
      <button class="btn-secondary" onclick={loadEvents}>Try again</button>
    </div>
  {:else if events.length === 0}
    <div style="text-align: center; padding: 48px 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: var(--radius-lg); background: var(--color-bg-sunken); border: 0.5px solid var(--color-line); margin-bottom: 16px; color: var(--color-ink-3);">
        <CalendarBlank size={24} />
      </div>
      <h2 class="h-display h-display-sm" style="color: var(--color-ink-2); margin-bottom: 8px;">
        No upcoming events
      </h2>
      <div style="font-size: var(--fs-sm); color: var(--color-ink-3); line-height: 1.5; max-width: 280px; margin: 0 auto;">
        Add recruiter calls, onsites, and deadlines to keep track of what's coming up.
      </div>
    </div>
  {:else}
    {#each Object.entries(grouped) as [day, items]}
      <div>
        <div class="list-section-label">
          <span>{day}</span>
          <span class="list-section-count">{items.length}</span>
        </div>
        {#each items as event (event.id)}
          <div style="display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 0.5px solid var(--color-line);">
            <div>
              <div style="font-size: 16px; font-weight: 700; color: var(--color-ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em;">
                {formatTime(event.event_date)}
              </div>
              <div style="font-size: var(--fs-2xs); color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-top: 3px;">
                {event.event_type}
              </div>
            </div>
            <div style="min-width: 0;">
              <div style="font-size: var(--fs-md); font-weight: 600; color: var(--color-ink); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {event.title}
              </div>
              {#if event.company_name}
                <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 3px;">
                  {event.company_name}{#if event.location} · {event.location}{/if}
                </div>
              {:else if event.location}
                <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 3px;">
                  {event.location}
                </div>
              {/if}
            </div>
            <div style="display: flex; align-items: center; gap: 2px;">
              {#if event.url}
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="icon-btn icon-btn-sm"
                  aria-label="Join link"
                  onclick={(e) => e.stopPropagation()}
                >
                  <ArrowSquareOut size={15} color="var(--color-ink-3)" />
                </a>
              {/if}
              <button
                class="icon-btn icon-btn-sm"
                aria-label="Delete event"
                onclick={() => (deleteTarget = event)}
              >
                <Trash size={14} color="var(--color-ink-3)" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

<!-- Create event modal -->
{#if showCreate}
  <Modal
    title="Add event"
    subtitle="Recruiter calls, onsites, take-home deadlines."
    busy={creating}
    maxWidth={360}
    onclose={() => (showCreate = false)}
  >
    {#if formError}
      <div class="alert alert-error" style="margin-bottom: 12px;">
        {formError}
      </div>
    {/if}
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <input class="input-field" aria-label="Event title" placeholder="Event title" bind:value={createTitle} />
      <input
        class="input-field"
        aria-label="Company"
        placeholder="Company (optional)"
        list="event-companies"
        bind:value={createCompanyText}
        autocomplete="off"
      />
      <datalist id="event-companies">
        {#each companies as co}
          <option value={co.name}></option>
        {/each}
      </datalist>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <input class="input-field" aria-label="Event date" type="date" bind:value={createDate} />
        <input class="input-field" aria-label="Event time" type="time" bind:value={createTime} />
      </div>
      <select class="input-field" aria-label="Event type" bind:value={createType}>
        <option value="call">Recruiter call</option>
        <option value="screen">Phone screen</option>
        <option value="onsite">Onsite / Virtual onsite</option>
        <option value="take-home">Take-home deadline</option>
        <option value="offer">Offer deadline</option>
        <option value="other">Other</option>
      </select>
      <input class="input-field" aria-label="Join link" placeholder="Join link (optional)" bind:value={createUrl} />
      <input class="input-field" aria-label="Location" placeholder="Location (optional)" bind:value={createLocation} />
    </div>
    <div class="action-row" style="margin-top: 16px;">
      <button class="btn-secondary" onclick={() => showCreate = false} disabled={creating}>
        Cancel
      </button>
      <button class="btn-primary btn-accent" style="flex: 1;" onclick={handleCreate} disabled={creating || !createTitle.trim() || !createDate}>
        {#if creating}<Spinner />{/if}
        Add event
      </button>
    </div>
  </Modal>
{/if}

{#if deleteTarget}
  <Modal
    title="Delete this event?"
    subtitle="{deleteTarget.title} will be removed. This can't be undone."
    busy={deleting}
    maxWidth={340}
    onclose={() => (deleteTarget = null)}
  >
    <div class="action-row">
      <button class="btn-secondary" onclick={() => (deleteTarget = null)} disabled={deleting}>Cancel</button>
      <button class="btn-secondary btn-danger" style="flex: 1;" onclick={confirmDelete} disabled={deleting}>
        {#if deleting}<Spinner />{:else}<Trash size={15} />{/if}
        Delete
      </button>
    </div>
  </Modal>
{/if}
