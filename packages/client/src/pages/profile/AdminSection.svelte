<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ProductMetrics } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import Spinner from "../../components/Spinner.svelte";
  import InlineFailure from "../../components/InlineFailure.svelte";

  let { onError, nativeIos = false }: { onError: (message: string) => void; nativeIos?: boolean } = $props();

  let loading = $state(true);
  let loadError: string | null = $state(null);
  let productMetrics: ProductMetrics | null = $state(null);

  function formatLatency(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${Math.round((seconds / 3600) * 10) / 10} hr`;
  }

  function formatRatio(value: number) {
    return `${Math.round(value * 1000) / 10}%`;
  }

  async function loadProductHealth() {
    loading = true;
    loadError = null;
    try {
      productMetrics = await api.metrics.get();
    } catch (caught) {
      loadError = errorMessage(caught);
      if (!nativeIos) onError(loadError);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadProductHealth();
  });
</script>

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading product health" /></div>
{:else if nativeIos && loadError}
  <InlineFailure title="Product health didn’t load" onRetry={() => void loadProductHealth()} />
{:else if productMetrics}
  <section class="admin-section">
    <div class="admin-section-heading">
      <h2>Product health</h2>
      <span>Last {productMetrics.period_days} days</span>
    </div>

    <div class="metric-summary">
      <section class="metric-group">
        <h3>Alerts</h3>
        <dl>
          <div><dt>Job to alert</dt><dd>{formatLatency(productMetrics.notification_latency_seconds)}</dd></div>
          <div><dt>Alert open rate</dt><dd>{productMetrics.notification_open_rate}%</dd></div>
          <div><dt>Alerts sent</dt><dd>{productMetrics.notifications_sent}</dd></div>
          <div><dt>Devices registered</dt><dd>{productMetrics.push_registrations}</dd></div>
        </dl>
      </section>

      <section class="metric-group">
        <h3>Search quality</h3>
        <dl>
          <div><dt>Viable profiles</dt><dd>{productMetrics.users_with_enough_matches}/{productMetrics.total_profiles}</dd></div>
          <div><dt>Onboarding completion</dt><dd>{productMetrics.onboarding_completion_rate}%</dd></div>
          <div><dt>Eligible-job dismissals</dt><dd>{productMetrics.eligible_job_dismissal_rate}%</dd></div>
          <div><dt>Profile changes</dt><dd>{productMetrics.profile_adjustments}</dd></div>
        </dl>
      </section>

      <section class="metric-group">
        <h3>Conversion</h3>
        <dl>
          <div><dt>Quick apply clicks</dt><dd>{productMetrics.apply_clicks_within_one_hour}</dd></div>
          <div><dt>Tailor to apply</dt><dd>{productMetrics.tailoring_to_application_rate}%</dd></div>
          <div><dt>New accounts</dt><dd>{productMetrics.accounts_created}</dd></div>
        </dl>
      </section>

      <section class="metric-group">
        <h3>Tailoring quality</h3>
        <dl>
          <div><dt>Evaluated PDFs</dt><dd>{productMetrics.tailoring_quality.sampleSize}/20</dd></div>
          <div><dt>Unsupported claims</dt><dd>{formatRatio(productMetrics.tailoring_quality.unsupportedClaimRate)}</dd></div>
          <div><dt>One-page PDFs</dt><dd>{formatRatio(productMetrics.tailoring_quality.onePageRate)}</dd></div>
          <div><dt>Device compile failures</dt><dd>{formatRatio(productMetrics.tailoring_quality.deviceFailureRate)}</dd></div>
          <div><dt>Supervised beta gate</dt><dd>{productMetrics.tailoring_quality.ready ? "Ready" : productMetrics.tailoring_quality.insufficientSample ? "Collecting data" : "Blocked"}</dd></div>
        </dl>
      </section>

      <section class="metric-group">
        <h3>Inbox</h3>
        <dl>
          <div><dt>Active feedback</dt><dd>{productMetrics.open_feedback}</dd></div>
          <div><dt>Open reports</dt><dd>{productMetrics.open_reports}</dd></div>
        </dl>
      </section>
    </div>
  </section>
{/if}

<style>
  .metric-summary {
    overflow: hidden;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elev);
  }

  .metric-group { padding: 14px 16px 8px; }
  .metric-group + .metric-group { border-top: 0.5px solid var(--color-line); }

  .metric-group h3 {
    margin: 0 0 7px;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.3;
  }

  .metric-group dl { margin: 0; }

  .metric-group dl > div {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .metric-group dt {
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
  }

  .metric-group dd {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  @media (min-width: 760px) {
    .metric-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric-group + .metric-group { border-top: 0; }
    .metric-group:nth-child(even) { border-left: 0.5px solid var(--color-line); }
    .metric-group:nth-child(n + 3) { border-top: 0.5px solid var(--color-line); }
  }
</style>
