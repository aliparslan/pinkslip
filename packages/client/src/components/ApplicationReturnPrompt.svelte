<script lang="ts">
  import { api } from "../lib/api";
  import { applicationIntent } from "../lib/application-intent.svelte";
  import { errorMessage } from "../lib/utils";
  import { feedback } from "../lib/feedback.svelte";
  import { feed } from "../lib/feed-store.svelte";
  import { presentPending } from "../lib/task-presentation.svelte";
  import Modal from "./Modal.svelte";
  import Spinner from "./Spinner.svelte";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";

  let submitting = $state(false);
  let showPending = $state(false);

  async function confirmApplied() {
    const intent = applicationIntent.pending;
    if (!intent || submitting) return;
    submitting = true;
    try {
      await presentPending(
        () => api.jobs.markApplied(intent.jobId),
        (pending) => { showPending = pending; },
      );
      feed.jobs = feed.jobs.filter((job) => job.id !== intent.jobId);
      applicationIntent.dismiss();
      feedback.success("Application added to your library");
    } catch (error) {
      feedback.error(errorMessage(error, "Could not mark that job as applied."));
    } finally {
      submitting = false;
      showPending = false;
    }
  }
</script>

{#if applicationIntent.pending}
  <Modal
    title="Did you apply?"
    subtitle={`${applicationIntent.pending.title} at ${applicationIntent.pending.company}`}
    busy={submitting}
    maxWidth={390}
    onclose={() => applicationIntent.dismiss()}
  >
    <p class="application-prompt-copy">
      Keep your application history accurate. You can always mark it later from the job page.
    </p>
    <div class="application-prompt-actions">
      <button
        type="button"
        class="btn-secondary"
        disabled={submitting}
        onclick={() => applicationIntent.dismiss()}
      >
        Not yet
      </button>
      <button
        type="button"
        class="btn-primary btn-accent"
        disabled={submitting}
        onclick={confirmApplied}
      >
        {#if showPending}<Spinner />{:else}<CheckCircle size={17} />{/if}
        Yes, I applied
      </button>
    </div>
  </Modal>
{/if}

<style>
  .application-prompt-copy {
    margin: 0 0 var(--space-5);
    color: var(--color-ink-2);
    font-size: var(--fs-md);
    line-height: 1.5;
  }

  .application-prompt-actions {
    display: grid;
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    gap: var(--space-2);
  }

  .application-prompt-actions > button {
    min-width: 0;
  }
</style>
