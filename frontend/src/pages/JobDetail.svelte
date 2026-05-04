<script lang="ts">
  import { navigate } from "../router";
  import { api } from "../lib/api";
  import CompanyLogo from "../components/CompanyLogo.svelte";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import MapPin from "phosphor-svelte/lib/MapPin";
  import CurrencyDollar from "phosphor-svelte/lib/CurrencyDollar";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";

  import Trash from "phosphor-svelte/lib/Trash";
  import Warning from "phosphor-svelte/lib/Warning";

  let { jobId }: { jobId: string | null } = $props();

  let job: any = $state(null);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let dismissing: boolean = $state(false);
  let saved: boolean = $state(false);
  let applied: boolean = $state(false);
  let applying: boolean = $state(false);
  let scoreExpanded: boolean = $state(false);
  let showBlockConfirm: boolean = $state(false);
  let blocking: boolean = $state(false);

  $effect(() => {
    if (!jobId) return;
    loading = true;
    error = null;
    api.jobs
      .get(jobId)
      .then((j) => { job = j; saved = j.saved ?? false; })
      .catch((e) => { error = e.message; })
      .finally(() => { loading = false; });
  });

  async function handleDismiss() {
    if (!jobId) return;
    dismissing = true;
    try {
      await api.jobs.dismiss(jobId);
      navigate("/");
    } catch (e: any) {
      error = e.message;
      dismissing = false;
    }
  }

  async function toggleSave() {
    if (!jobId) return;
    const newVal = !saved;
    saved = newVal;
    try {
      if (newVal) {
        await api.savedJobs.save(jobId);
      } else {
        await api.savedJobs.unsave(jobId);
      }
    } catch (e: any) {
      saved = !newVal;
      error = e.message;
    }
  }

  async function handleBlock() {
    if (!jobId || blocking) return;
    blocking = true;
    try {
      await api.jobs.block(jobId);
      navigate("/");
    } catch (e: any) {
      error = e.message;
      blocking = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  let scorePercent = $derived(job?.score ?? 0);
  let scoreLabel = $derived(
    scorePercent >= 70 ? "Strong match" :
    scorePercent >= 40 ? "Moderate match" :
    "Low match"
  );
  let scoreColor = $derived(
    scorePercent >= 70 ? "var(--color-good)" :
    scorePercent >= 40 ? "var(--color-warn)" :
    "var(--color-ink-3)"
  );

  const scoreBreakdownKeys = [
    { label: "Title", key: "title_score", max: 35 },
    { label: "YOE", key: "yoe_score", max: 25 },
    { label: "Location", key: "location_score", max: 20 },
    { label: "Department", key: "department_score", max: 10 },
    { label: "Recency", key: "recency_score", max: 10 },
  ];

  interface DescSection { heading: string; items: string[] }

  const KEEP_HEADINGS = /role|responsibilit|you.?ll|you.?re excited|excited about you|what we.?re looking|qualif|require|experience|you have|you bring|what you.?ll need|skills|about this/i;
  const SKIP_HEADINGS = /about (the company|doordash|us)|diversity|inclusion|equal opportunity|benefits|perks|notice to|commitment to|who we are|our mission/i;

  function parseDescription(html: string): DescSection[] {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("img, script, style, .content-intro, .content-conclusion").forEach((el) => el.remove());
    div.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach((el) => el.remove());

    const sections: DescSection[] = [];
    let current: DescSection | null = null;

    for (const node of div.children) {
      const tag = node.tagName;
      const text = (node.textContent ?? "").trim();
      if (!text) continue;

      const isHeading = tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" || (tag === "P" && node.querySelector("strong") && text.length < 80);

      if (isHeading) {
        if (SKIP_HEADINGS.test(text)) { current = null; continue; }
        if (KEEP_HEADINGS.test(text)) {
          current = { heading: text, items: [] };
          sections.push(current);
        } else {
          current = null;
        }
        continue;
      }

      if (!current) continue;

      if (tag === "UL" || tag === "OL") {
        for (const li of node.querySelectorAll("li")) {
          const t = (li.textContent ?? "").trim();
          if (t) current.items.push(t);
        }
      } else if (tag === "P") {
        if (text) current.items.push(text);
      }
    }

    return sections.filter((s) => s.items.length > 0);
  }

  function extractPayRanges(html: string): string[] {
    const div = document.createElement("div");
    div.innerHTML = html;
    const ranges: string[] = [];
    for (const el of div.querySelectorAll(".pay-input")) {
      const title = el.querySelector(".title")?.textContent?.trim() ?? "";
      const spans = el.querySelectorAll(".pay-range span:not(.divider)");
      if (spans.length >= 2) {
        const min = spans[0].textContent?.trim() ?? "";
        const max = spans[1].textContent?.trim() ?? "";
        ranges.push(title ? `${title}: ${min} – ${max}` : `${min} – ${max}`);
      }
    }
    return ranges;
  }

  let parsedDesc = $derived(job?.description ? parseDescription(job.description) : []);
  let payRanges = $derived(job?.description ? extractPayRanges(job.description) : []);
</script>

<div class="page">
  <!-- Header -->
  <header style="padding: 8px 22px 12px; display: flex; align-items: center; justify-content: space-between;">
    <button class="icon-btn" aria-label="Back" onclick={() => navigate("/")}>
      <ArrowLeft size={20} />
    </button>
    <div style="display: flex; gap: 0;">
      <button class="icon-btn" aria-label="Block job" onclick={() => { showBlockConfirm = true; }}>
        <Trash size={18} color="var(--color-ink-3)" />
      </button>
      <button class="icon-btn" aria-label="Save" onclick={toggleSave}>
        <BookmarkSimple size={20} weight={saved ? "fill" : "regular"} color={saved ? "var(--color-accent)" : "var(--color-ink-2)"} />
      </button>
    </div>
  </header>

  <div style="padding: 0 28px 28px;">
    {#if loading}
      <div style="text-align: center; padding: 48px 0; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
        Loading...
      </div>
    {:else if error}
      <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
        {error}
      </div>
    {:else if job}
      <!-- Company + Title header -->
      <div style="display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px;">
        <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={52} />
        <div style="flex: 1; min-width: 0;">
          <div style="font-family: var(--font-mono); font-size: 11.5px; color: var(--color-ink-2); margin-bottom: 4px; letter-spacing: -0.005em;">
            {job.company_name}{#if job.ats_type} · via {job.ats_type}{/if}
          </div>
          <h1 class="h-display" style="font-size: 26px; letter-spacing: -0.025em;">
            {job.title}
          </h1>
        </div>
      </div>

      <!-- Stats -->
      <div class="stat-row" style="margin-bottom: 22px;">
        {#if job.location}
          <span>
            <MapPin size={13} />
            {job.location}
          </span>
        {/if}
        {#if job.salary}
          <span>
            <CurrencyDollar size={13} />
            {job.salary}
          </span>
        {/if}
        {#if job.posted_at}
          <span>{formatDate(job.posted_at)}</span>
        {/if}
      </div>

      <!-- Score (collapsible) -->
      <div style="border-radius: 14px; margin-bottom: 24px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); overflow: hidden;">
        <button
          type="button"
          onclick={() => scoreExpanded = !scoreExpanded}
          style="width: 100%; text-align: left; padding: 14px 16px; background: transparent; border: 0; display: flex; gap: 12px; align-items: center; cursor: pointer;"
        >
          <div style="font-family: var(--font-mono); font-size: 22px; font-weight: 600; color: {scoreColor}; letter-spacing: -0.02em;">
            {scorePercent}%
          </div>
          <div style="flex: 1;">
            <div style="font-size: 13.5px; font-weight: 600; color: var(--color-ink); margin-bottom: 2px;">{scoreLabel}</div>
            <div style="font-size: 12px; color: var(--color-ink-2);">
              {scoreExpanded ? "Tap to collapse" : "Tap for breakdown"}
            </div>
          </div>
          <div style="transition: transform .2s; transform: rotate({scoreExpanded ? '180deg' : '0'});">
            <CaretDown size={16} color="var(--color-ink-3)" />
          </div>
        </button>

        {#if scoreExpanded}
          <div style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--color-line); padding-top: 14px;">
            {#each scoreBreakdownKeys as { label, key, max }}
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 13.5px; color: var(--color-ink); font-weight: 500;">{label}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 80px; height: 4px; background: var(--color-line-2); border-radius: 999px; overflow: hidden;">
                    <div style="height: 100%; background: var(--color-accent); width: {((job[key] ?? 0) / max) * 100}%; border-radius: 999px;"></div>
                  </div>
                  <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-2); width: 36px; text-align: right;">
                    {job[key] ?? 0}/{max}
                  </span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Pay ranges -->
      {#if payRanges.length > 0}
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px;">
          {#each payRanges as range}
            <div style="font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: 8px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); color: var(--color-ink);">
              {range}
            </div>
          {/each}
        </div>
      {/if}

      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          {#if job.url}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary btn-accent"
              style="text-decoration: none;"
            >
              Apply now
              <ArrowSquareOut size={16} />
            </a>
          {/if}
          <button
            class="btn-secondary"
            onclick={() => jobId && navigate(`/tailor/${jobId}`)}
          >
            Tailor materials
          </button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button
            class="btn-secondary"
            disabled={applied || applying}
            onclick={async () => {
              if (!jobId || !job) return;
              applying = true;
              try {
                await api.applications.create({
                  job_id: jobId,
                  company_name: job.company_name,
                  title: job.title,
                  url: job.url ?? "",
                });
                applied = true;
                await api.jobs.dismiss(jobId);
                navigate("/");
              } catch (e: any) {
                error = e.message;
                applying = false;
              }
            }}
          >
            <CheckCircle size={16} />
            {applied ? "Tracked" : applying ? "..." : "Mark as applied"}
          </button>
          <button
            class="btn-secondary"
            onclick={handleDismiss}
            disabled={dismissing}
          >
            {dismissing ? "..." : "Dismiss for me"}
          </button>
        </div>
      </div>

      <!-- Description (parsed) -->
      {#if parsedDesc.length > 0}
        <div style="margin-bottom: 24px; display: flex; flex-direction: column; gap: 16px;">
          {#each parsedDesc as section}
            <div>
              <h3 style="font-size: 13.5px; font-weight: 600; margin-bottom: 8px; color: var(--color-ink);">{section.heading}</h3>
              <ul style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
                {#each section.items as item}
                  <li style="font-size: 13.5px; line-height: 1.55; color: var(--color-ink-2);">{item}</li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      {/if}

    {/if}
  </div>
</div>

<!-- Block confirmation modal -->
{#if showBlockConfirm}
  <div
    style="position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => { showBlockConfirm = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') showBlockConfirm = false; }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-title"
      tabindex="-1"
      style="width: 100%; max-width: 340px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 18px; padding: 24px; animation: fade-in 0.15s;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') showBlockConfirm = false; }}
    >
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); display: flex; align-items: center; justify-content: center;">
          <Warning size={18} color="var(--color-bad)" />
        </div>
        <div id="block-title" style="font-size: 17px; font-weight: 600;">Block this job?</div>
      </div>
      <p style="font-size: 13.5px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 20px;">
        This will permanently remove <strong>{job?.title}</strong> from all users' feeds. It will never appear again, even in future polls.
        <br /><br />
        If you just want to hide it for yourself, use <strong>Dismiss</strong> instead.
      </p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button
          class="btn-secondary"
          style="width: 100%; height: 48px;"
          onclick={() => { showBlockConfirm = false; handleDismiss(); }}
        >
          Just dismiss for me
        </button>
        <button
          class="btn-primary"
          style="width: 100%; height: 48px; background: var(--color-bad); color: #fff; border-color: var(--color-bad);"
          disabled={blocking}
          onclick={handleBlock}
        >
          {blocking ? "..." : "Block permanently"}
        </button>
        <button
          style="appearance: none; border: 0; background: transparent; cursor: pointer; font-size: 13px; color: var(--color-ink-3); padding: 8px 0;"
          onclick={() => { showBlockConfirm = false; }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
