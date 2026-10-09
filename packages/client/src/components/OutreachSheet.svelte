<script lang="ts">
  import { onMount } from "svelte";
  import { api, ApiError, type OutreachMessage, type OutreachThread } from "@pinkslip/core/api";
  import { errorMessage } from "@pinkslip/core/utils";
  import { nextOutreachMessage, outreachMailtoUrl } from "../../../../shared/outreach";
  import { feedback } from "../lib/feedback.svelte";
  import Modal from "./Modal.svelte";
  import Spinner from "./Spinner.svelte";
  import EnvelopeSimple from "phosphor-svelte/lib/EnvelopeSimple";
  import Copy from "phosphor-svelte/lib/Copy";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";

  let {
    jobId,
    companyName,
    threadId = null,
    onclose,
  }: {
    jobId: string;
    companyName: string;
    threadId?: string | null;
    onclose: () => void;
  } = $props();

  const STEP_LABELS = ["First email", "Follow-up", "Last follow-up"] as const;

  let thread = $state<OutreachThread | null>(null);
  let loading = $state(true);
  let loadError: string | null = $state(null);
  let busy = $state(false);
  let opened = $state(false);
  let subject = $state("");
  let body = $state("");

  let next = $derived(thread ? nextOutreachMessage(thread) : null);
  let dirty = $derived(Boolean(next && (subject !== next.subject || body !== next.body)));
  let notDueYet = $derived(Boolean(next?.due_at && Date.parse(next.due_at) > Date.now()));

  function adopt(nextThread: OutreachThread) {
    const previousId = next?.id;
    thread = nextThread;
    const message = nextOutreachMessage(nextThread);
    if (message && message.id !== previousId) {
      subject = message.subject;
      body = message.body;
      opened = false;
    }
  }

  async function load() {
    loading = true;
    loadError = null;
    try {
      if (threadId) {
        adopt(await api.outreach.get(threadId));
      } else {
        const { threads } = await api.outreach.list(jobId);
        adopt(threads[0] ?? await api.outreach.start(jobId));
      }
    } catch (error) {
      loadError = error instanceof ApiError && error.code === "no_contacts"
        ? `No recruiter found for ${companyName} yet.`
        : errorMessage(error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  async function saveEdits(): Promise<boolean> {
    if (!next || !dirty) return true;
    try {
      adopt(await api.outreach.edit(next.id, { subject, body }));
      return true;
    } catch (error) {
      feedback.error(errorMessage(error));
      return false;
    }
  }

  async function openInMail() {
    if (!thread || !next || busy) return;
    busy = true;
    try {
      if (!(await saveEdits())) return;
      window.location.href = outreachMailtoUrl(thread.contact.email, { subject, body });
      opened = true;
    } finally {
      busy = false;
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(`${thread?.contact.email ?? ""}\n${subject}\n\n${body}`);
      feedback.success("Copied");
    } catch {
      feedback.error("Couldn’t copy. Select the text instead.");
    }
  }

  async function run(action: () => Promise<OutreachThread | void>, done?: string) {
    if (busy) return;
    busy = true;
    try {
      const result = await action();
      if (result) adopt(result);
      if (done) feedback.success(done);
    } catch (error) {
      feedback.error(errorMessage(error));
    } finally {
      busy = false;
    }
  }

  function markSent() {
    if (!next) return;
    const messageId = next.id;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void run(async () => {
      if (!(await saveEdits())) return;
      return api.outreach.markSent(messageId, timeZone);
    });
  }

  function discard() {
    if (!thread) return;
    const id = thread.id;
    void run(async () => {
      await api.outreach.discard(id);
      onclose();
    });
  }

  function formatWhen(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function stepState(message: OutreachMessage): string {
    if (message.status === "sent" && message.sent_at) return `Sent ${formatWhen(message.sent_at)}`;
    if (message.status === "scheduled" && message.due_at) return `Due ${formatWhen(message.due_at)}`;
    if (message.status === "skipped") return "Skipped";
    return "";
  }

  const closedLabel: Record<string, string> = {
    replied: "They replied",
    stopped: "Stopped",
    finished: "All sent",
  };
</script>

<Modal
  title={`Email ${companyName}`}
  subtitle={thread ? `To ${thread.contact.name || thread.contact.email}` : ""}
  maxWidth={520}
  busy={busy}
  onclose={() => { void saveEdits(); onclose(); }}
>
  {#if loading}
    <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading email" /></div>
  {:else if loadError}
    <div class="stack-sm">
      <p class="alert alert-error" role="alert">{loadError}</p>
      <button class="btn-secondary full-width" onclick={() => void load()}>Try again</button>
    </div>
  {:else if thread}
    <div class="form-stack">
      {#if thread.contact.test}
        <p class="alert alert-warn">Test recipient: {thread.contact.email}</p>
      {/if}

      <ol class="outreach-steps" aria-label="Emails">
        {#each thread.messages as message (message.id)}
          <li class:current={message.id === next?.id} class:done={message.status === "sent"}>
            {#if message.status === "sent"}
              <CheckCircle size={16} weight="fill" aria-hidden="true" />
            {:else}
              <span class="step-dot" aria-hidden="true"></span>
            {/if}
            <span class="step-label">{STEP_LABELS[message.step]}</span>
            <span class="step-state">{stepState(message)}</span>
          </li>
        {/each}
      </ol>

      {#if next}
        <input
          class="input-field"
          aria-label="Subject"
          bind:value={subject}
          onblur={() => void saveEdits()}
          disabled={busy}
        />
        <textarea
          class="input-field textarea-field outreach-body"
          aria-label="Message"
          rows="10"
          bind:value={body}
          onblur={() => void saveEdits()}
          disabled={busy}
        ></textarea>

        <div class="action-row">
          <button class="icon-btn icon-btn-surface" aria-label="Copy email" onclick={copyMessage} disabled={busy}>
            <Copy size={18} aria-hidden="true" />
          </button>
          {#if opened}
            <button class="btn-secondary" onclick={openInMail} disabled={busy}>Open again</button>
            <button class="btn-primary btn-accent flex-fill" onclick={markSent} disabled={busy}>
              {#if busy}<Spinner />{:else}<CheckCircle size={18} weight="bold" aria-hidden="true" />{/if}
              I sent it
            </button>
          {:else}
            <button class="btn-primary btn-accent flex-fill" onclick={openInMail} disabled={busy}>
              {#if busy}<Spinner />{:else}<EnvelopeSimple size={18} weight="bold" aria-hidden="true" />{/if}
              {notDueYet ? "Send early in Mail" : "Open in Mail"}
            </button>
          {/if}
        </div>

        <div class="button-cluster outreach-secondary">
          {#if thread.status === "draft"}
            <button class="text-button" onclick={discard} disabled={busy}>Discard</button>
          {:else}
            <button class="text-button" onclick={() => void run(() => api.outreach.markReplied(thread!.id), "Follow-ups stopped")} disabled={busy}>
              They replied
            </button>
            <button class="text-button" onclick={() => void run(() => api.outreach.stop(thread!.id), "Follow-ups stopped")} disabled={busy}>
              Stop follow-ups
            </button>
          {/if}
        </div>
      {:else}
        <p class="outreach-closed">{closedLabel[thread.status] ?? ""}</p>
      {/if}
    </div>
  {/if}
</Modal>

<style>
  .outreach-steps {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .outreach-steps li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
  }

  .outreach-steps li.current {
    color: var(--color-ink);
  }

  .outreach-steps li.done {
    color: var(--color-ink-2);
  }

  .outreach-steps li.done :global(svg) {
    color: var(--color-good);
  }

  .step-dot {
    width: 16px;
    height: 16px;
    flex: none;
    border: 1.5px solid var(--color-line);
    border-radius: var(--radius-full);
  }

  .outreach-steps li.current .step-dot {
    border-color: var(--color-accent);
  }

  .step-label {
    font-weight: 500;
  }

  .step-state {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .outreach-body {
    min-height: 220px;
    line-height: 1.45;
  }

  .outreach-secondary {
    justify-content: center;
  }

  .outreach-closed {
    margin: 0;
    color: var(--color-ink-2);
    text-align: center;
  }
</style>
