<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { timeAgo } from "../lib/utils";
  import CompanyLogo from "../components/CompanyLogo.svelte";
  import CalendarBlank from "phosphor-svelte/lib/CalendarBlank";
  import Plus from "phosphor-svelte/lib/Plus";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Trash from "phosphor-svelte/lib/Trash";

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
  let showCreate: boolean = $state(false);
  let creating: boolean = $state(false);
  let formError: string | null = $state(null);

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

  // Group events by day
  let grouped = $derived.by(() => {
    const g: Record<string, EventItem[]> = {};
    for (const e of events) {
      const d = new Date(e.event_date);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let label: string;
      if (d.toDateString() === today.toDateString()) label = "Today";
      else if (d.toDateString() === tomorrow.toDateString()) label = "Tomorrow";
      else label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

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
    try {
      const res = await api.events.list({ upcoming: "true" });
      events = (res.events ?? []) as EventItem[];
    } catch {
      events = [];
    } finally {
      loading = false;
    }
  }

  async function loadCompanies() {
    try {
      const res = await api.companies.list();
      companies = (res.companies ?? []).filter((c: any) => c.enabled).map((c: any) => ({ id: c.id, name: c.name, website: c.website }));
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
    } catch (e: any) {
      formError = e.message;
    } finally {
      creating = false;
    }
  }

  async function deleteEvent(id: string) {
    events = events.filter((e) => e.id !== id);
    try {
      await api.events.delete(id);
    } catch {
      loadEvents();
    }
  }

  onMount(() => {
    loadEvents();
    loadCompanies();
  });
</script>

<div class="page" style="padding-top: 0;">
  <div style="padding: 16px 16px 8px;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <div class="h-display" style="font-size: 28px; letter-spacing: -0.02em;">
        Upcoming
      </div>
      <button
        class="btn-secondary"
        style="height: 34px; padding: 0 12px; font-size: 12px;"
        onclick={() => showCreate = true}
      >
        <Plus size={14} />
        Add
      </button>
    </div>
    <div style="font-size: 13px; color: var(--color-ink-3);">
      {events.length} event{events.length !== 1 ? "s" : ""} scheduled
    </div>
  </div>

  {#if loading}
    <div style="padding: 48px 16px; text-align: center; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
      Loading...
    </div>
  {:else if events.length === 0}
    <div style="text-align: center; padding: 48px 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: var(--color-bg-sunken); border: 0.5px solid var(--color-line); margin-bottom: 16px; color: var(--color-ink-3);">
        <CalendarBlank size={24} />
      </div>
      <div class="h-display" style="font-size: 22px; color: var(--color-ink-2); margin-bottom: 8px;">
        No upcoming events
      </div>
      <div style="font-size: 13px; color: var(--color-ink-3); line-height: 1.5; max-width: 280px; margin: 0 auto;">
        Add recruiter calls, onsites, and deadlines to keep track of what's coming up.
      </div>
    </div>
  {:else}
    {#each Object.entries(grouped) as [day, items]}
      <div>
        <div style="padding: 14px 16px 6px; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;">
          {day}
        </div>
        {#each items as event (event.id)}
          <div style="display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 0.5px solid var(--color-line);">
            <div>
              <div style="font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: var(--color-ink); font-variant-numeric: tabular-nums;">
                {formatTime(event.event_date)}
              </div>
              <div style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-top: 2px;">
                {event.event_type}
              </div>
            </div>
            <div style="min-width: 0;">
              <div style="font-size: 14px; font-weight: 600; color: var(--color-ink); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {event.title}
              </div>
              {#if event.company_name}
                <div style="font-size: 11px; color: var(--color-ink-3); font-family: var(--font-mono); margin-top: 2px;">
                  {event.company_name}{#if event.location} · {event.location}{/if}
                </div>
              {:else if event.location}
                <div style="font-size: 11px; color: var(--color-ink-3); font-family: var(--font-mono); margin-top: 2px;">
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
                  class="icon-btn"
                  style="width: 32px; height: 32px;"
                  aria-label="Join link"
                  onclick={(e) => e.stopPropagation()}
                >
                  <ArrowSquareOut size={15} color="var(--color-ink-3)" />
                </a>
              {/if}
              <button
                class="icon-btn"
                style="width: 32px; height: 32px;"
                aria-label="Delete event"
                onclick={() => deleteEvent(event.id)}
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
  <div
    style="position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => showCreate = false}
  >
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      style="width: 100%; max-width: 360px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 16px; padding: 20px; animation: fade-in 0.15s;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === "Escape") showCreate = false; }}
    >
      <div class="h-display" style="font-size: 22px; margin-bottom: 6px;">Add event</div>
      <div style="font-size: 13px; color: var(--color-ink-3); margin-bottom: 16px;">
        Recruiter calls, onsites, take-home deadlines.
      </div>
      {#if formError}
        <div style="padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px;">
          {formError}
        </div>
      {/if}
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <input class="input-field" placeholder="Event title" bind:value={createTitle} />
        <input
          class="input-field"
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
          <input class="input-field" type="date" bind:value={createDate} />
          <input class="input-field" type="time" bind:value={createTime} />
        </div>
        <select class="input-field" bind:value={createType}>
          <option value="call">Recruiter call</option>
          <option value="screen">Phone screen</option>
          <option value="onsite">Onsite / Virtual onsite</option>
          <option value="take-home">Take-home deadline</option>
          <option value="offer">Offer deadline</option>
          <option value="other">Other</option>
        </select>
        <input class="input-field" placeholder="Join link (optional)" bind:value={createUrl} />
        <input class="input-field" placeholder="Location (optional)" bind:value={createLocation} />
      </div>
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button class="btn-primary btn-accent" style="flex: 1;" onclick={handleCreate} disabled={creating || !createTitle.trim() || !createDate}>
          {creating ? "Saving..." : "Add event"}
        </button>
        <button class="btn-secondary" style="padding: 0 16px;" onclick={() => showCreate = false}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
