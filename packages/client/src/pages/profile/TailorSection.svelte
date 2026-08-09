<script lang="ts">
  import { onMount } from "svelte";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import ShieldCheck from "phosphor-svelte/lib/ShieldCheck";
  import { api, type AppFeatures } from "../../lib/api";
  import { navigate } from "../../router";

  let {
    sessionState,
    features,
    showHeading = true,
  }: {
    sessionState: "anonymous" | "guest" | "authenticated";
    features: AppFeatures | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    showHeading?: boolean;
  } = $props();

  let includedCount = $state(0);
  let includedRemaining: number | null = $state(null);
  let includedLimit = $derived(
    includedRemaining === null ? null : includedCount + includedRemaining
  );
  let ready = $derived(Boolean(
    sessionState === "authenticated"
    && features?.tailoring_enabled
    && features.tailoring_provider === "workers_ai"
  ));

  async function loadUsage() {
    const usage = await api.tailor
      .usage(features?.tailoring_model)
      .then((response) => response.usage)
      .catch(() => null);
    includedCount = usage?.included_user_today ?? 0;
    includedRemaining = usage?.included_user_remaining ?? null;
  }

  onMount(() => {
    void loadUsage();
  });
</script>

<section>
  {#if showHeading}<h2 class="section-eyebrow">Tailoring</h2>{/if}
  <div class="content-card tailoring-settings">
    <header class="tailoring-heading">
      <span class="tailoring-icon" aria-hidden="true"><MagicWand size={21} weight="duotone" /></span>
      <div>
        <h2>AI tailoring</h2>
        <p>
          {#if ready}
            Match saved resume evidence to a role, review the plan, then create a validated resume.
          {:else if sessionState !== "authenticated"}
            Sign in to use included evidence-grounded tailoring.
          {:else}
            Included tailoring is temporarily unavailable.
          {/if}
        </p>
      </div>
    </header>

    {#if includedLimit !== null}
      <div class="usage-meter">
        <div class="usage-copy">
          <span>Free uses today</span>
          <strong>{includedCount}/{includedLimit}</strong>
        </div>
        <div
          class="usage-track"
          role="progressbar"
          aria-label="Free tailoring uses today"
          aria-valuemin="0"
          aria-valuemax={includedLimit}
          aria-valuenow={Math.min(includedCount, includedLimit)}
        >
          <span style="width: {Math.min(100, (includedCount / Math.max(1, includedLimit)) * 100)}%;"></span>
        </div>
        <small>{includedRemaining ?? 0} remaining</small>
      </div>
    {/if}

    <div class="evidence-note">
      <ShieldCheck size={19} weight="fill" aria-hidden="true" />
      <p>Contact details, employers, schools, dates, credentials, and metrics are copied from your saved profile—not generated.</p>
    </div>

    <button class="resume-link" type="button" onclick={() => navigate("/you/resume")}>
      <span>
        <strong>Structured resume</strong>
        <small>Review the evidence tailoring is allowed to use</small>
      </span>
      <ArrowRight size={18} weight="bold" aria-hidden="true" />
    </button>
  </div>
</section>

<style>
  .tailoring-settings {
    display: grid;
    gap: var(--space-6);
  }

  .tailoring-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
  }

  .tailoring-heading h2,
  .tailoring-heading p,
  .evidence-note p {
    margin: 0;
  }

  .tailoring-heading h2 {
    color: var(--color-ink);
    font-size: var(--fs-lg);
    line-height: 1.3;
  }

  .tailoring-heading p,
  .evidence-note p {
    margin-top: var(--space-1);
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .tailoring-icon {
    width: var(--tap-min);
    height: var(--tap-min);
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
  }

  .usage-meter {
    display: grid;
    gap: var(--space-2);
  }

  .usage-copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
  }

  .usage-track {
    height: var(--space-2);
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--color-bg-sunken);
  }

  .usage-track span {
    height: 100%;
    display: block;
    border-radius: var(--radius-full);
    background: var(--color-accent);
  }

  .usage-meter small {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .evidence-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-good-soft);
    color: var(--color-good);
  }

  .evidence-note p {
    margin: 0;
    color: var(--color-ink-2);
  }

  .resume-link {
    width: 100%;
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border: 0;
    border-top: 1px solid var(--color-line);
    background: transparent;
    color: var(--color-ink);
    text-align: left;
  }

  .resume-link > span {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .resume-link small {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  :global(html.native-ios) .tailoring-settings {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
</style>
