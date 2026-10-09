<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    type ApplicationAnswerValue,
    type PreparedApplication,
    type PreparedApplicationField,
  } from "@pinkslip/core/api";
  import { errorMessage } from "@pinkslip/core/utils";
  import { isAnswered } from "../../../../shared/application-form";
  import { feedback } from "../lib/feedback.svelte";
  import { autofillPayload, autofillScript } from "../lib/application-autofill";
  import type { ApplicationAutofill } from "../lib/application-intent.svelte";
  import { loadResumeFile } from "../lib/resume-file-store";
  import Modal from "./Modal.svelte";
  import Spinner from "./Spinner.svelte";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";

  let {
    jobId,
    companyName,
    onopen,
    onclose,
  }: {
    jobId: string;
    companyName: string;
    /** Opens the employer's application page, filled in where the app can. */
    onopen: (autofill: ApplicationAutofill | null) => void;
    onclose: () => void;
  } = $props();

  let prepared = $state<PreparedApplication | null>(null);
  let loading = $state(true);
  let loadError: string | null = $state(null);
  let saving = $state(false);
  let drafts = $state<Record<string, string>>({});
  // Fixed when the form loads, so answering a question doesn't move it.
  let needsIds = $state<Set<string>>(new Set());

  let fields = $derived(prepared?.fields ?? []);
  let needs = $derived(fields.filter((field) => needsIds.has(field.id)));
  let questions = $derived(fields.filter((field) => !needsIds.has(field.id) && field.section === "questions"));
  let about = $derived(fields.filter((field) => !needsIds.has(field.id) && field.section === "about"));
  let voluntary = $derived(fields.filter((field) => !needsIds.has(field.id) && field.section === "voluntary"));
  let missing = $derived(prepared?.missing_required ?? 0);

  function adopt(next: PreparedApplication) {
    prepared = next;
    const nextDrafts: Record<string, string> = {};
    for (const field of next.fields) {
      if (typeof field.answer === "string") nextDrafts[field.id] = field.answer;
    }
    drafts = nextDrafts;
  }

  async function load() {
    loading = true;
    loadError = null;
    try {
      const next = await api.apply.prepare(jobId);
      if (!next.supported) {
        // Nothing to prepare for this employer's form; go straight to it.
        onopen(null);
        onclose();
        return;
      }
      needsIds = new Set(next.fields.filter((field) => field.required && !isAnswered(field.answer)).map((field) => field.id));
      adopt(next);
    } catch (error) {
      loadError = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  let opening = $state(false);

  async function openApplication() {
    if (!prepared || opening) return;
    opening = true;
    try {
      const payload = autofillPayload(prepared, await loadResumeFile());
      onopen(payload && prepared.apply_url
        ? { url: prepared.apply_url, script: autofillScript(payload) }
        : null);
      onclose();
    } finally {
      opening = false;
    }
  }

  async function save(field: PreparedApplicationField, value: ApplicationAnswerValue | null) {
    saving = true;
    try {
      adopt(await api.apply.saveAnswers(jobId, { [field.id]: value }));
    } catch (error) {
      feedback.error(errorMessage(error));
    } finally {
      saving = false;
    }
  }

  function saveText(field: PreparedApplicationField) {
    const value = drafts[field.id] ?? "";
    if (value === (typeof field.answer === "string" ? field.answer : "")) return;
    void save(field, value.trim() ? value : null);
  }

  function choose(field: PreparedApplicationField, label: string) {
    if (field.type === "multiselect") {
      const current = Array.isArray(field.answer) ? field.answer : [];
      const next = current.includes(label) ? current.filter((item) => item !== label) : [...current, label];
      void save(field, next.length > 0 ? next : null);
      return;
    }
    void save(field, field.answer === label ? null : label);
  }

  function usesChips(field: PreparedApplicationField): boolean {
    return field.type === "boolean"
      || field.type === "multiselect"
      || (field.options.length <= 4 && field.options.every((option) => option.label.length <= 40));
  }

  function selected(field: PreparedApplicationField, label: string): boolean {
    return Array.isArray(field.answer) ? field.answer.includes(label) : field.answer === label;
  }

  function inputType(field: PreparedApplicationField): string {
    if (field.type === "email") return "email";
    if (field.type === "phone") return "tel";
    if (field.type === "url") return "url";
    if (field.type === "date") return "date";
    return "text";
  }

  function summary(group: PreparedApplicationField[]): string {
    if (group.every((field) => field.source === "default")) return "Declined";
    const open = group.filter((field) => !isAnswered(field.answer)).length;
    return open > 0 ? `${open} open` : "Filled";
  }
</script>

{#snippet control(field: PreparedApplicationField)}
  <div class="prep-field" class:missing={field.required && !isAnswered(field.answer)}>
    <span class="field-label" id={`prep-${field.id}`}>{field.label}</span>
    {#if field.type === "file"}
      <p class="prep-static">{field.answer ?? "Add in the form"}</p>
    {:else if field.type === "select" || field.type === "boolean" || field.type === "multiselect"}
      {#if usesChips(field)}
        <div class="chip-wrap" role="group" aria-labelledby={`prep-${field.id}`}>
          {#each field.options as option (option.value)}
            <button
              type="button"
              class="chip prep-chip"
              class:chip-active={selected(field, option.label)}
              aria-pressed={selected(field, option.label)}
              disabled={saving}
              onclick={() => choose(field, option.label)}
            >{option.label}</button>
          {/each}
        </div>
      {:else}
        <div class="select-field-wrap">
          <select
            class="input-field"
            aria-labelledby={`prep-${field.id}`}
            value={typeof field.answer === "string" ? field.answer : ""}
            disabled={saving}
            onchange={(event) => void save(field, event.currentTarget.value || null)}
          >
            <option value="">Choose</option>
            {#each field.options as option (option.value)}
              <option value={option.label}>{option.label}</option>
            {/each}
          </select>
        </div>
      {/if}
    {:else if field.type === "textarea"}
      <textarea
        class="input-field textarea-field"
        rows="4"
        aria-labelledby={`prep-${field.id}`}
        bind:value={drafts[field.id]}
        onblur={() => saveText(field)}
      ></textarea>
    {:else}
      <input
        class="input-field"
        type={inputType(field)}
        inputmode={field.type === "number" ? "decimal" : undefined}
        aria-labelledby={`prep-${field.id}`}
        bind:value={drafts[field.id]}
        onblur={() => saveText(field)}
      />
    {/if}
  </div>
{/snippet}

<Modal
  title={`Apply to ${companyName}`}
  subtitle={prepared ? (missing > 0 ? `${missing} to answer` : "Ready") : ""}
  maxWidth={560}
  onclose={onclose}
>
  {#if loading}
    <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading application" /></div>
  {:else if loadError}
    <div class="stack-sm">
      <p class="alert alert-error" role="alert">{loadError}</p>
      <button class="btn-secondary full-width" onclick={() => void load()}>Try again</button>
      <button class="text-button" onclick={() => { onopen(null); onclose(); }}>Open the application anyway</button>
    </div>
  {:else if prepared}
    <div class="form-stack">
      {#if needs.length > 0}
        <section class="prep-group" aria-label="Needs you">
          <h3 class="prep-heading">Needs you</h3>
          {#each needs as field (field.id)}{@render control(field)}{/each}
        </section>
      {/if}
      {#if questions.length > 0}
        <section class="prep-group" aria-label="Questions">
          <h3 class="prep-heading">Questions</h3>
          {#each questions as field (field.id)}{@render control(field)}{/each}
        </section>
      {/if}
      {#if about.length > 0}
        <details class="prep-group">
          <summary class="prep-heading">About you <span>{summary(about)}</span></summary>
          {#each about as field (field.id)}{@render control(field)}{/each}
        </details>
      {/if}
      {#if voluntary.length > 0}
        <details class="prep-group">
          <summary class="prep-heading">Voluntary <span>{summary(voluntary)}</span></summary>
          {#each voluntary as field (field.id)}{@render control(field)}{/each}
        </details>
      {/if}

      <button class="btn-primary btn-accent full-width tall-control" onclick={() => void openApplication()} disabled={saving || opening}>
        {#if saving || opening}<Spinner />{:else}<ArrowSquareOut size={18} weight="bold" aria-hidden="true" />{/if}
        Open application
      </button>
    </div>
  {/if}
</Modal>

<style>
  .prep-group {
    display: grid;
    gap: var(--space-4);
  }

  .prep-heading {
    display: flex;
    justify-content: space-between;
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  summary.prep-heading {
    cursor: pointer;
  }

  .prep-heading span {
    color: var(--color-ink-3);
    font-weight: 400;
  }

  details.prep-group[open] summary {
    margin-bottom: var(--space-1);
  }

  .prep-field {
    display: grid;
    gap: var(--space-1);
  }

  .prep-field .field-label {
    margin: 0;
    line-height: 1.35;
  }

  .prep-field.missing .field-label {
    color: var(--color-ink);
  }

  .prep-chip {
    height: auto;
    min-height: var(--control-height-small);
    padding-block: var(--space-1);
    white-space: normal;
    text-align: left;
  }

  .prep-static {
    margin: 0;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
  }
</style>
