<script lang="ts">
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import { api, type AppFeatures, type FetchRun } from "../lib/api";
  import { registerPush } from "../lib/push";
  import { navigate } from "../router";

  const DEFAULTS = {
    locations: "Remote, New York, San Francisco, Bay Area, Chicago, Boston, Washington DC, Seattle, Austin",
    roleKeywords: "software engineer, fullstack, backend, frontend, forward deployed engineer",
    negativeKeywords: "staff, principal, director, intern, manager, senior staff, vp, head of",
    minYoe: 0,
    maxYoe: 2,
    notificationThreshold: 50,
  } as const;

  let enablingPush: boolean = $state(false);
  let loading: boolean = $state(true);
  let saving: boolean = $state(false);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);

  let displayName: string = $state("");
  let savedDisplayName: string = $state("");
  let locations: string = $state("");
  let roleKeywords: string = $state("");
  let negativeKeywords: string = $state("");
  let minYoe: number = $state(0);
  let maxYoe: number = $state(10);
  let notificationThreshold: number = $state(50);
  let pushStatus: string = $state("disabled");
  let testingNotif: string | null = $state(null);
  let features: AppFeatures | null = $state(null);
  let runs: FetchRun[] = $state([]);
  let refreshingAll: boolean = $state(false);
  let refreshLog: string[] = $state([]);

  const shortcuts = [
    { label: "Companies", sub: "Manage the shared watchlist", path: "/companies" },
    { label: "Corpus", sub: "Edit the material tailoring pulls from", path: "/corpus" },
  ] as const;

  async function loadSettings() {
    loading = true;
    error = null;
    try {
      const [prefsResult, meResult, runsResult] = await Promise.allSettled([
        api.preferences.get(),
        api.me.get(),
        api.runs.list(50),
      ]);

      if (meResult.status === "fulfilled") {
        displayName = meResult.value.user?.name ?? "";
        savedDisplayName = meResult.value.user?.name ?? "";
        features = meResult.value.features ?? null;
      } else {
        throw meResult.reason;
      }

      if (prefsResult.status === "fulfilled") {
        const prefs = prefsResult.value;
        locations = ((prefs.locations as string[] | undefined) ?? []).join(", ");
        roleKeywords = ((prefs.role_keywords as string[] | undefined) ?? []).join(", ");
        negativeKeywords = ((prefs.negative_keywords as string[] | undefined) ?? []).join(", ");
        minYoe = (prefs.min_yoe as number | undefined) ?? 0;
        maxYoe = (prefs.max_yoe as number | undefined) ?? 10;
        notificationThreshold = (prefs.notify_threshold as number | undefined)
          ?? (prefs.notification_threshold as number | undefined)
          ?? 50;
      } else {
        throw prefsResult.reason;
      }

      if (runsResult.status === "fulfilled") {
        runs = runsResult.value.runs ?? [];
      } else {
        runs = [];
      }

      if ("serviceWorker" in navigator && "PushManager" in window) {
        navigator.serviceWorker.ready.then(async (reg) => {
          const sub = await reg.pushManager.getSubscription();
          pushStatus = sub ? "enabled" : "disabled";
        });
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadSettings();
  });

  function parseList(str: string): string[] {
    return str.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function handleSave() {
    saving = true;
    error = null;
    successMsg = null;
    try {
      const trimmedName = displayName.trim();
      if (trimmedName && trimmedName !== savedDisplayName) {
        await api.me.update({ name: trimmedName });
        savedDisplayName = trimmedName;
        displayName = trimmedName;
      }

      await api.preferences.update({
        locations: parseList(locations),
        role_keywords: parseList(roleKeywords),
        negative_keywords: parseList(negativeKeywords),
        min_yoe: minYoe,
        max_yoe: maxYoe,
        notify_threshold: notificationThreshold,
      });
      successMsg = "Preferences saved.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  function resetToDefaults() {
    locations = DEFAULTS.locations;
    roleKeywords = DEFAULTS.roleKeywords;
    negativeKeywords = DEFAULTS.negativeKeywords;
    minYoe = DEFAULTS.minYoe;
    maxYoe = DEFAULTS.maxYoe;
    notificationThreshold = DEFAULTS.notificationThreshold;
  }
</script>

<div class="page">
  <div style="padding: 0 22px 28px;">
    <h1 class="h-display" style="font-size: 30px; margin-bottom: 20px;">
      Profile
    </h1>

    {#if loading}
      <div style="text-align: center; padding: 48px 0; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
        Loading...
      </div>
    {:else}
      {#if successMsg}
        <div class="toast-wrap">
          <div class="toast-pill" in:fly={{ y: -14, duration: 160 }} out:fly={{ y: -10, duration: 120 }}>
            {successMsg}
          </div>
        </div>
      {/if}
      <div style="display: flex; flex-direction: column; gap: 24px;">
        {#if error}
          <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
            {error}
          </div>
        {/if}

        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Identity</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px;">
            <div>
              <label for="display-name" style="font-size: 13.5px; font-weight: 500; margin-bottom: 6px; display: block;">Display name</label>
              <input id="display-name" type="text" class="input-field" placeholder="Your name" bind:value={displayName} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Shared state is group-wide, your tracking and dismissals stay personal.</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              {#each shortcuts as shortcut}
                <button
                  class="btn-secondary"
                  style="width: 100%; justify-content: space-between; padding: 0 14px;"
                  onclick={() => navigate(shortcut.path)}
                >
                  <span>{shortcut.label}</span>
                  <span style="font-size: 12px; color: var(--color-ink-3);">{shortcut.sub}</span>
                </button>
              {/each}
            </div>
          </div>
        </section>

        <!-- Job Preferences -->
        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Job preferences</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 16px;">
            <div>
              <label for="locations" style="font-size: 13.5px; font-weight: 500; margin-bottom: 6px; display: block;">Locations</label>
              <input id="locations" type="text" class="input-field" placeholder="Remote, NYC, SF" bind:value={locations} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Comma-separated</span>
            </div>
            <div>
              <label for="role-keywords" style="font-size: 13.5px; font-weight: 500; margin-bottom: 6px; display: block;">Role keywords</label>
              <input id="role-keywords" type="text" class="input-field" placeholder="Software Engineer, SWE, Fullstack" bind:value={roleKeywords} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Comma-separated</span>
            </div>
            <div>
              <label for="neg-keywords" style="font-size: 13.5px; font-weight: 500; margin-bottom: 6px; display: block;">Negative keywords</label>
              <input id="neg-keywords" type="text" class="input-field" placeholder="Intern, Sales, Senior Staff" bind:value={negativeKeywords} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Jobs with these words score lower</span>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button class="btn-secondary" style="height: 36px; padding: 0 14px;" onclick={resetToDefaults}>
                Reset defaults
              </button>
            </div>
          </div>
        </section>

        <!-- Experience -->
        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Experience range</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; padding: 18px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label for="min-yoe" style="font-size: 13.5px; font-weight: 500; margin-bottom: 6px; display: block;">Min YOE</label>
                <input id="min-yoe" type="number" class="input-field" min="0" max="20" bind:value={minYoe} />
              </div>
              <div>
                <label for="max-yoe" style="font-size: 13.5px; font-weight: 500; margin-bottom: 6px; display: block;">Max YOE</label>
                <input id="max-yoe" type="number" class="input-field" min="0" max="20" bind:value={maxYoe} />
              </div>
            </div>
          </div>
        </section>

        <!-- Notifications -->
        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Notifications</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden;">
            <!-- Push toggle -->
            <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 14.5px; font-weight: 500;">Push notifications</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Get notified for high-scoring jobs</div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-family: var(--font-mono); font-size: 11px; color: {pushStatus === 'enabled' ? 'var(--color-good)' : 'var(--color-ink-4)'};">
                  {pushStatus}
                </span>
                {#if pushStatus !== "enabled"}
                  <button
                    class="btn-secondary"
                    style="height: 32px; padding: 0 14px; font-size: 12px;"
                    disabled={enablingPush}
                    onclick={async () => {
                      enablingPush = true;
                      try {
                        const ok = await registerPush();
                        pushStatus = ok ? "enabled" : "disabled";
                        if (!ok) error = "Push permission denied or not supported";
                      } catch (e: any) {
                        error = e.message;
                      } finally {
                        enablingPush = false;
                      }
                    }}
                  >
                    {enablingPush ? "..." : "Enable"}
                  </button>
                {/if}
              </div>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <!-- Threshold -->
            <div style="padding: 16px 18px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <div style="font-size: 14.5px; font-weight: 500;">Score threshold</div>
                <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--color-accent);">
                  {notificationThreshold}
                </span>
              </div>
              <input type="range" min="0" max="100" step="5" style="width: 100%;" bind:value={notificationThreshold} />
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-ink-4);">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <!-- Poll interval -->
            <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-size: 14.5px; font-weight: 500;">Poll interval</div>
              <span style="font-family: var(--font-mono); font-size: 12px; color: var(--color-ink-3);">Every 15 min</span>
            </div>
          </div>
        </section>

        <!-- Test Notifications -->
        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Test notifications</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; padding: 18px;">
            {#if testingNotif}
              <div style="padding: 12px 14px; border-radius: 10px; background: color-mix(in oklch, var(--color-accent) 14%, transparent); color: var(--color-accent-soft-ink); font-family: var(--font-mono); font-size: 12px; margin-bottom: 14px;">
                {testingNotif}
              </div>
            {/if}
            <div style="display: flex; gap: 8px;">
              <button
                class="btn-secondary"
                style="flex: 1;"
                disabled={!!testingNotif}
                onclick={async () => {
                  testingNotif = "Sending...";
                  try {
                    const res = await api.push.test(0);
                    testingNotif = null;
                    successMsg = `Sent to ${res.sent} device(s)`;
                    setTimeout(() => (successMsg = null), 3000);
                  } catch (e: any) {
                    testingNotif = null;
                    error = e.message;
                  }
                }}
              >
                Send now
              </button>
              <button
                class="btn-secondary"
                style="flex: 1;"
                disabled={!!testingNotif}
                onclick={async () => {
                  testingNotif = "Sending in 5s...";
                  try {
                    const res = await api.push.test(5);
                    testingNotif = null;
                    successMsg = `Sent to ${res.sent} device(s)`;
                    setTimeout(() => (successMsg = null), 3000);
                  } catch (e: any) {
                    testingNotif = null;
                    error = e.message;
                  }
                }}
              >
                Send in 5s
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Tailoring</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <div>
                <div style="font-size: 14.5px; font-weight: 500;">Anthropic status</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">
                  {#if features?.tailoring_enabled}
                    Ready with {features.tailoring_model}
                  {:else}
                    Set `ANTHROPIC_API_KEY` to enable streaming resume and cover tailoring.
                  {/if}
                </div>
              </div>
              <span class="tag">{features?.tailoring_enabled ? "live" : "off"}</span>
            </div>
          </div>
        </section>

        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Operations</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; flex-direction: column; align-items: stretch; gap: 12px;">
              <div>
                <div style="font-size: 14.5px; font-weight: 500;">Force refresh all companies</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Runs the full poll loop right now for the active batch.</div>
              </div>
              <button
                class="btn-secondary"
                style="width: 100%; height: 44px; padding: 0 14px;"
                disabled={refreshingAll}
                onclick={async () => {
                  refreshingAll = true;
                  error = null;
                  try {
                    const result = await api.ops.refreshAll();
                    refreshLog = result.log ?? [];
                    successMsg = `Polled ${result.companiesPolled} companies · ${result.newJobsFound} new jobs`;
                    await loadSettings();
                    setTimeout(() => (successMsg = null), 3000);
                  } catch (e: any) {
                    error = e.message;
                  } finally {
                    refreshingAll = false;
                  }
                }}
              >
                {refreshingAll ? "Running..." : "Run now"}
              </button>
            </div>
            {#if refreshLog.length > 0}
              <div style="padding: 12px 14px; border-radius: 12px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); display: flex; flex-direction: column; gap: 4px;">
                {#each refreshLog.slice(0, 8) as line}
                  <div>{line}</div>
                {/each}
              </div>
            {/if}
          </div>
        </section>

        <section>
          <h3 class="section-title" style="margin-bottom: 14px;">Recent fetch runs</h3>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden;">
            {#if runs.length === 0}
              <div style="padding: 18px; font-size: 13px; color: var(--color-ink-3);">
                No fetch runs yet.
              </div>
            {:else}
              {#each runs.slice(0, 12) as run, index}
                <div style="padding: 14px 16px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
                  <div>
                    <div style="font-size: 13.5px; font-weight: 600; text-transform: capitalize;">
                      {run.status} · {run.new_jobs_found} new · {run.companies_succeeded}/{run.companies_attempted}
                    </div>
                    <div style="font-size: 11.5px; color: var(--color-ink-3); margin-top: 4px; font-family: var(--font-mono);">
                      {new Date(run.started_at).toLocaleString()} · {run.duration_ms ?? 0}ms
                    </div>
                    {#if run.errors_json}
                      <div style="font-size: 11.5px; color: var(--color-bad); margin-top: 6px; max-width: 280px;">
                        {run.errors_json}
                      </div>
                    {/if}
                  </div>
                  <span class="tag">{run.notifications_sent} pushes</span>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <!-- Save -->
        <button
          class="btn-primary btn-accent"
          style="width: 100%;"
          onclick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save preferences"}
        </button>
      </div>
    {/if}
  </div>
</div>
