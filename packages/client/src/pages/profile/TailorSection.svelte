<script lang="ts">
  import { onMount } from "svelte";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
  import Sparkle from "phosphor-svelte/lib/Sparkle";
  import ShieldCheck from "phosphor-svelte/lib/ShieldCheck";
  import { api, type AppFeatures } from "../../lib/api";
  import { navigate } from "../../router";

  let {
    sessionState,
    features,
    showHeading = true,
    usageOutside = false,
  }: {
    sessionState: "anonymous" | "guest" | "authenticated";
    features: AppFeatures | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    showHeading?: boolean;
    usageOutside?: boolean;
  } = $props();

  let includedCount = $state(0);
  let includedRemaining: number | null = $state(null);
  let includedLimit = $derived(
    includedRemaining === null ? null : includedCount + includedRemaining
  );
  let remainingPercent = $derived(
    includedLimit === null
      ? 0
      : Math.min(100, ((includedRemaining ?? 0) / Math.max(1, includedLimit)) * 100)
  );
  let usageTone = $derived(remainingPercent > 50 ? "healthy" : remainingPercent > 20 ? "warning" : "critical");
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

{#snippet usageMeter()}
  {#if includedLimit !== null}
    <div class="usage-meter" class:outside-usage={usageOutside}>
      <div class="usage-copy">
        <span class="usage-label"><Sparkle size={17} weight="fill" aria-hidden="true" /> Free uses today</span>
        <strong>
          <span>{includedRemaining ?? 0}</span><span class="usage-limit">/{includedLimit}</span>
        </strong>
      </div>
      <div
        class="usage-track"
        role="progressbar"
        aria-label="Free tailoring uses remaining today"
        aria-valuemin="0"
        aria-valuemax={includedLimit}
        aria-valuenow={includedRemaining ?? 0}
      >
        <span class={usageTone} style="width: {remainingPercent}%;"></span>
      </div>
      <small class="usage-reset">Resets daily</small>
    </div>
  {/if}
{/snippet}

<section>
  {#if showHeading}<h2 class="section-eyebrow">Tailoring</h2>{/if}
  {#if usageOutside}{@render usageMeter()}{/if}
  <div class="content-card tailoring-settings">
    <header class="tailoring-heading">
      <span class="tailoring-icon" aria-hidden="true"><Sparkle size={21} weight="fill" /></span>
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

    {#if !usageOutside}{@render usageMeter()}{/if}

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
    width: var(--space-6);
    height: var(--space-6);
    display: grid;
    place-items: center;
    color: var(--color-accent);
  }

  .usage-meter {
    display: grid;
    gap: var(--space-2);
    font-family: var(--font-sans);
  }

  .usage-meter.outside-usage {
    gap: var(--space-3);
    margin-bottom: var(--space-6);
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .usage-copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
  }

  .usage-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .outside-usage .usage-label {
    color: var(--color-ink);
    font-size: var(--fs-base);
    font-weight: 600;
  }

  .outside-usage .usage-copy > strong {
    color: var(--color-ink);
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1;
  }

  .usage-limit {
    color: var(--color-ink-3);
    font-weight: 500;
  }

  .outside-usage .usage-track {
    height: var(--space-3);
  }

  .usage-reset {
    margin-top: calc(0px - var(--space-2));
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    text-align: end;
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
    transition: width var(--duration-standard) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
  }

  .usage-track span.healthy { background: var(--color-good); }
  .usage-track span.warning { background: var(--color-warn); }
  .usage-track span.critical { background: var(--color-bad); }

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
