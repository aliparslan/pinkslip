<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ApplicationAnswerValue, type SavedApplicationAnswer } from "@pinkslip/core/api";
  import { errorMessage } from "@pinkslip/core/utils";
  import { formatResumeDate, monthInputValue } from "@pinkslip/core/resume-fields";
  import Trash from "phosphor-svelte/lib/Trash";
  import X from "phosphor-svelte/lib/X";
  import Spinner from "../../components/Spinner.svelte";
  import EmptyState from "../../components/EmptyState.svelte";
  import InlineFailure from "../../components/InlineFailure.svelte";
  import { feedback, UNDO_TOAST_DURATION } from "../../lib/feedback.svelte";
  import { ActivationEdge } from "../../lib/activation";
  import type { SavePresentation } from "../../lib/task-presentation.svelte";
  import {
    PRONOUN_OPTIONS,
    effectiveAuthorization,
    isCommonQuestionKey,
    staleAuthorizationKeys,
  } from "../../../../../shared/application-answers";
  import type { SearchProfileV1, WorkAuthorization } from "../../../../../shared/search-profile";

  let {
    searchProfile = $bindable(),
    presentation,
    active = true,
  }: {
    /** Sponsorship is the work authorization in job preferences; Profile saves it. */
    searchProfile: SearchProfileV1;
    presentation: SavePresentation;
    active?: boolean;
  } = $props();

  const SPONSORSHIP: Array<{ id: WorkAuthorization; label: string }> = [
    { id: "authorized", label: "Not needed" },
    { id: "sponsorship", label: "Needed" },
    { id: "not_sure", label: "Not sure" },
  ];
  const HYBRID_DAYS = ["1", "2", "3", "4"];
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  let answers = $state<SavedApplicationAnswer[]>([]);
  let resumeGraduation = $state("");
  let loading = $state(true);
  let loadError = $state(false);
  let editing = $state<string | null>(null);
  let hybridOpen = $state(false);
  let pronounOther = $state(false);
  const activation = new ActivationEdge();
  const queues = new Map<string, Promise<unknown>>();
  const versions = new Map<string, number>();

  let remembered = $derived(answers.filter((answer) => !isCommonQuestionKey(answer.key) && answer.key !== "sponsorship"));
  let sponsorship = $derived(effectiveAuthorization(searchProfile.work_authorization, answers));
  let officeDays = $derived(text("office_days"));
  let hybrid = $derived(hybridOpen || HYBRID_DAYS.includes(officeDays));
  let startDate = $derived(text("start_date"));
  let graduation = $derived(monthInputValue(text("graduation") || resumeGraduation));
  let pronouns = $derived(text("pronouns"));
  let pronounPreset = $derived(PRONOUN_OPTIONS.find((option) => sameStart(pronouns, option)) ?? null);
  let showPronounInput = $derived(pronounOther || (pronouns !== "" && !pronounPreset));

  function text(key: string): string {
    const value = answers.find((answer) => answer.key === key)?.value;
    return typeof value === "string" ? value : "";
  }

  /** "He/him/his" still reads as the "He/him" preset. */
  function sameStart(value: string, option: string): boolean {
    const words = (input: string) => input.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    return value !== "" && (words(value) === words(option) || words(value).startsWith(`${words(option)} `));
  }

  async function load(silent = false) {
    if (!silent) loading = true;
    try {
      const [bank, resume] = await Promise.all([api.apply.answers(), api.profile.get().catch(() => null)]);
      answers = bank.answers;
      resumeGraduation = resume?.data.education[0]?.endDate.trim() ?? "";
      loadError = false;
    } catch {
      if (!silent) loadError = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  $effect(() => {
    if (activation.becameActive(active)) void load(true);
  });

  function place(answer: SavedApplicationAnswer, index = 0) {
    const at = answers.findIndex((candidate) => candidate.key === answer.key);
    if (at >= 0) answers[at] = answer;
    else answers.splice(Math.min(index, answers.length), 0, answer);
  }

  function drop(key: string) {
    answers = answers.filter((answer) => answer.key !== key);
  }

  /** Requests for one question run in order; a failure undoes the local
   * change unless a newer one has replaced it. */
  async function persist(key: string, task: () => Promise<unknown>, revert: () => void): Promise<boolean> {
    const version = (versions.get(key) ?? 0) + 1;
    versions.set(key, version);
    const generation = presentation.begin();
    const run = (queues.get(key) ?? Promise.resolve()).then(task);
    queues.set(key, run.catch(() => undefined));
    try {
      await run;
      presentation.succeed(generation);
      return true;
    } catch (error) {
      if (versions.get(key) === version) revert();
      const message = errorMessage(error);
      presentation.fail(generation, message);
      feedback.error(message);
      return false;
    }
  }

  function save(key: string, value: ApplicationAnswerValue, label?: string, index = 0) {
    const previous = answers.find((answer) => answer.key === key);
    place({ key, value, label: label ?? previous?.label ?? "", updated_at: previous?.updated_at ?? new Date().toISOString() }, index);
    void persist(key, () => api.apply.setAnswer(key, value, label), () => (previous ? place(previous) : drop(key)));
  }

  function clear(key: string): { answer: SavedApplicationAnswer; index: number } | null {
    const index = answers.findIndex((answer) => answer.key === key);
    if (index < 0) return null;
    const answer = answers[index];
    drop(key);
    void persist(key, () => api.apply.deleteAnswer(key), () => place(answer, index));
    return { answer, index };
  }

  /** Taps the chosen chip again to unanswer it. */
  function toggle(key: string, value: string) {
    if (text(key) === value) clear(key);
    else save(key, value);
  }

  function commitText(key: string, raw: string) {
    const value = raw.trim();
    if (value === text(key)) return;
    if (value) save(key, value);
    else clear(key);
  }

  function chooseSponsorship(choice: WorkAuthorization) {
    if (searchProfile.work_authorization !== choice) searchProfile = { ...searchProfile, work_authorization: choice };
    // A saved answer outranks job preferences, so one that disagrees goes.
    for (const key of staleAuthorizationKeys(choice, answers)) clear(key);
  }

  function chooseOffice(choice: "remote" | "hybrid" | "onsite") {
    if (choice === "hybrid") {
      if (HYBRID_DAYS.includes(officeDays)) clear("office_days");
      hybridOpen = !hybrid;
      return;
    }
    const value = choice === "remote" ? "0" : "5";
    const shownActive = officeDays === value && !hybrid;
    hybridOpen = false;
    if (shownActive) clear("office_days");
    else if (officeDays !== value) save("office_days", value);
  }

  /** "Other" means none of the presets, so it clears one; tapped again it
   * clears what was typed. */
  function choosePronoun(option: string | null) {
    if (option === null) {
      const closing = showPronounInput;
      pronounOther = !closing;
      if (pronouns && (closing || pronounPreset)) clear("pronouns");
      return;
    }
    pronounOther = false;
    if (pronounPreset === option) clear("pronouns");
    else save("pronouns", option);
  }

  function display(value: ApplicationAnswerValue): string {
    if (Array.isArray(value)) return value.join(", ");
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
    if (value === "decline") return "Prefer not to say";
    return value;
  }

  function remove(answer: SavedApplicationAnswer) {
    if (editing === answer.key) editing = null;
    const removed = clear(answer.key);
    if (!removed) return;
    feedback.show({
      message: "Answer deleted",
      duration: UNDO_TOAST_DURATION,
      action: { label: "Undo", run: () => save(removed.answer.key, removed.answer.value, removed.answer.label, removed.index) },
    });
  }

  function removeItem(answer: SavedApplicationAnswer, item: string) {
    const rest = (Array.isArray(answer.value) ? answer.value : [answer.value]).filter((value) => value !== item);
    if (rest.length === 0) remove(answer);
    else save(answer.key, rest);
  }

  /** Saves on blur but stays open, so tapping the row again closes it. */
  function commitEdit(answer: SavedApplicationAnswer, raw: string) {
    const value = raw.trim();
    if (value && value !== answer.value) save(answer.key, value);
  }

  /** Enter (on one line) saves and closes; Escape closes without saving. */
  function editKey(
    event: KeyboardEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement },
    answer: SavedApplicationAnswer,
    multiline: boolean,
  ) {
    const field = event.currentTarget;
    if (event.key === "Escape") field.value = answer.value === "decline" ? "" : String(answer.value);
    else if (event.key !== "Enter" || multiline) return;
    event.preventDefault();
    field.blur();
    editing = null;
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }
</script>

{#snippet chip(label: string, selected: boolean, onclick: () => void)}
  <button type="button" class="chip answers-chip" class:chip-active={selected} aria-pressed={selected} {onclick}>{label}</button>
{/snippet}

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading answers" /></div>
{:else if loadError}
  <InlineFailure title="Answers didn’t load" onRetry={() => void load()} />
{:else}
  <div class="answers-page">
    <section class="answers-section" aria-labelledby="answers-common-title">
      <h2 id="answers-common-title" class="section-eyebrow">Common questions</h2>
      <div class="content-card answers-card">
        <div class="answers-field">
          <span class="field-label" id="answers-sponsorship">Visa sponsorship</span>
          <div class="chip-wrap" role="group" aria-labelledby="answers-sponsorship">
            {#each SPONSORSHIP as option (option.id)}
              {@render chip(option.label, sponsorship === option.id, () => chooseSponsorship(option.id))}
            {/each}
          </div>
        </div>

        <div class="answers-field">
          <span class="field-label" id="answers-office">Days in an office</span>
          <div class="chip-wrap" role="group" aria-labelledby="answers-office">
            {@render chip("Remote only", officeDays === "0" && !hybrid, () => chooseOffice("remote"))}
            {@render chip("Hybrid", hybrid, () => chooseOffice("hybrid"))}
            {@render chip("Fully onsite", officeDays === "5" && !hybrid, () => chooseOffice("onsite"))}
          </div>
          {#if hybrid}
            <div class="chip-wrap" role="group" aria-label="Most days a week in an office">
              <span class="answers-inline-label" aria-hidden="true">Up to</span>
              {#each HYBRID_DAYS as days (days)}
                {@render chip(days === "1" ? "1 day" : `${days} days`, officeDays === days, () => { hybridOpen = false; toggle("office_days", days); })}
              {/each}
            </div>
          {/if}
        </div>

        <div class="answers-field">
          <span class="field-label" id="answers-relocation">Open to relocation</span>
          <div class="chip-wrap" role="group" aria-labelledby="answers-relocation">
            {@render chip("Yes", text("relocation") === "yes", () => toggle("relocation", "yes"))}
            {@render chip("No", text("relocation") === "no", () => toggle("relocation", "no"))}
          </div>
        </div>

        <div class="form-grid-2">
          <label class="answers-field">
            <span class="field-label">Earliest start</span>
            {#if startDate && !ISO_DATE.test(startDate)}
              <input class="input-field" value={startDate} maxlength="60" onchange={(event) => commitText("start_date", event.currentTarget.value)} />
            {:else}
              <input class="input-field" type="date" value={startDate} onchange={(event) => commitText("start_date", event.currentTarget.value)} />
            {/if}
          </label>
          <label class="answers-field">
            <span class="field-label">Graduation</span>
            <input
              class="input-field"
              type="month"
              value={graduation}
              onchange={(event) => commitText("graduation", event.currentTarget.value ? formatResumeDate(event.currentTarget.value) : "")}
            />
          </label>
        </div>

        <label class="answers-field">
          <span class="field-label">Salary expectation</span>
          <input class="input-field" value={text("salary")} maxlength="120" onchange={(event) => commitText("salary", event.currentTarget.value)} />
        </label>

        <div class="answers-field">
          <span class="field-label" id="answers-pronouns">Pronouns</span>
          <div class="chip-wrap" role="group" aria-labelledby="answers-pronouns">
            {#each PRONOUN_OPTIONS as option (option)}
              {@render chip(option, pronounPreset === option && !pronounOther, () => choosePronoun(option))}
            {/each}
            {@render chip("Other", showPronounInput, () => choosePronoun(null))}
          </div>
          {#if showPronounInput}
            <input
              class="input-field"
              aria-labelledby="answers-pronouns"
              value={pronouns}
              maxlength="40"
              onchange={(event) => commitText("pronouns", event.currentTarget.value)}
            />
          {/if}
        </div>
      </div>
    </section>

    <section class="answers-section" aria-labelledby="answers-saved-title">
      <h2 id="answers-saved-title" class="section-eyebrow">Remembered</h2>
      {#if remembered.length === 0}
        <EmptyState compact title="No saved answers yet" />
      {:else}
        <div class="surface-list">
          {#each remembered as answer (answer.key)}
            <div class="answers-row">
              <button
                type="button"
                class="answers-row-main"
                aria-expanded={editing === answer.key}
                onclick={() => (editing = editing === answer.key ? null : answer.key)}
              >
                <span class="answers-question">{answer.label || "Untitled question"}</span>
                <span class="answers-value">{display(answer.value)}</span>
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-sm"
                aria-label={`Delete answer to ${answer.label || "this question"}`}
                onclick={() => remove(answer)}
              ><Trash size={16} aria-hidden="true" /></button>
              {#if editing === answer.key}
                <div class="answers-editor">
                  {#if answer.value === "yes" || answer.value === "no"}
                    <div class="chip-wrap" role="group" aria-label={answer.label}>
                      {#each ["yes", "no"] as option (option)}
                        {@render chip(display(option), answer.value === option, () => { editing = null; save(answer.key, option); })}
                      {/each}
                    </div>
                  {:else if Array.isArray(answer.value)}
                    <div class="chip-wrap" role="group" aria-label={answer.label}>
                      {#each answer.value as item}
                        <button type="button" class="chip answers-chip chip-active" aria-label={`Remove ${item}`} onclick={() => removeItem(answer, item)}>
                          {item}<X size={12} aria-hidden="true" />
                        </button>
                      {/each}
                    </div>
                  {:else if answer.value.length > 80 || answer.value.includes("\n")}
                    <textarea
                      class="input-field textarea-field"
                      rows="5"
                      aria-label={answer.label || "Answer"}
                      value={answer.value}
                      maxlength="10000"
                      use:focusOnMount
                      onblur={(event) => commitEdit(answer, event.currentTarget.value)}
                      onkeydown={(event) => editKey(event, answer, true)}
                    ></textarea>
                  {:else}
                    <input
                      class="input-field"
                      aria-label={answer.label || "Answer"}
                      value={answer.value === "decline" ? "" : answer.value}
                      placeholder={answer.value === "decline" ? "Prefer not to say" : undefined}
                      maxlength="10000"
                      use:focusOnMount
                      onblur={(event) => commitEdit(answer, event.currentTarget.value)}
                      onkeydown={(event) => editKey(event, answer, false)}
                    />
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .answers-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .answers-section .section-eyebrow {
    margin-bottom: var(--space-2);
  }

  .answers-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .answers-field {
    display: grid;
    gap: var(--space-2);
  }

  .answers-field .field-label {
    margin: 0;
  }

  .answers-chip {
    height: auto;
    min-height: var(--control-height-small);
    padding-block: var(--space-1);
  }

  .answers-inline-label {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .answers-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-2) var(--space-3) var(--space-4);
  }

  .answers-row + .answers-row {
    border-top: 0.5px solid var(--color-line);
  }

  .answers-row-main {
    appearance: none;
    min-width: 0;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-1) 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .answers-question,
  .answers-value {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: anywhere;
  }

  .answers-question {
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }

  .answers-value {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 500;
    line-height: 1.4;
  }

  .answers-editor {
    grid-column: 1 / -1;
    padding-right: var(--space-2);
  }
</style>
