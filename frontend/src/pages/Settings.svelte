<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { registerPush } from "../lib/push";

  let enablingPush: boolean = $state(false);
  let loading: boolean = $state(true);
  let saving: boolean = $state(false);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);

  let locations: string = $state("");
  let roleKeywords: string = $state("");
  let negativeKeywords: string = $state("");
  let minYoe: number = $state(0);
  let maxYoe: number = $state(10);
  let notificationThreshold: number = $state(70);
  let pushStatus: string = $state("disabled");
  let testingNotif: string | null = $state(null);

  onMount(() => {
    loading = true;
    api.preferences
      .get()
      .then((prefs) => {
        locations = ((prefs.locations as string[] | undefined) ?? []).join(", ");
        roleKeywords = ((prefs.role_keywords as string[] | undefined) ?? []).join(", ");
        negativeKeywords = ((prefs.negative_keywords as string[] | undefined) ?? []).join(", ");
        minYoe = (prefs.min_yoe as number | undefined) ?? 0;
        maxYoe = (prefs.max_yoe as number | undefined) ?? 10;
        notificationThreshold = (prefs.notification_threshold as number | undefined) ?? 70;
        if ("serviceWorker" in navigator && "PushManager" in window) {
          navigator.serviceWorker.ready.then(async (reg) => {
            const sub = await reg.pushManager.getSubscription();
            pushStatus = sub ? "enabled" : "disabled";
          });
        }
      })
      .catch((e) => { error = e.message; })
      .finally(() => { loading = false; });
  });

  function parseList(str: string): string[] {
    return str.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function handleSave() {
    saving = true;
    error = null;
    successMsg = null;
    try {
      await api.preferences.update({
        locations: parseList(locations),
        role_keywords: parseList(roleKeywords),
        negative_keywords: parseList(negativeKeywords),
        min_yoe: minYoe,
        max_yoe: maxYoe,
        notification_threshold: notificationThreshold,
      });
      successMsg = "Preferences saved.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <div style="padding: 0 22px 28px;">
    <p class="h-eyebrow" style="margin-bottom: 6px;">Preferences</p>
    <h1 class="h-display" style="font-size: 30px; margin-bottom: 20px;">
      Settings.
    </h1>

    {#if loading}
      <div style="text-align: center; padding: 48px 0; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
        Loading...
      </div>
    {:else}
      <div style="display: flex; flex-direction: column; gap: 24px;">
        {#if error}
          <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
            {error}
          </div>
        {/if}
        {#if successMsg}
          <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-good) 14%, transparent); color: var(--color-good); font-size: 14px;">
            {successMsg}
          </div>
        {/if}

        <!-- Job Preferences -->
        <section>
          <h3 class="h-eyebrow" style="margin-bottom: 14px;">Job preferences</h3>
          <div style="background: var(--color-bg-elev); border: 0.5px solid var(--color-line); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 16px;">
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
          </div>
        </section>

        <!-- Experience -->
        <section>
          <h3 class="h-eyebrow" style="margin-bottom: 14px;">Experience range</h3>
          <div style="background: var(--color-bg-elev); border: 0.5px solid var(--color-line); border-radius: 14px; padding: 18px;">
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
          <h3 class="h-eyebrow" style="margin-bottom: 14px;">Notifications</h3>
          <div style="background: var(--color-bg-elev); border: 0.5px solid var(--color-line); border-radius: 14px; overflow: hidden;">
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
          <h3 class="h-eyebrow" style="margin-bottom: 14px;">Test notifications</h3>
          <div style="background: var(--color-bg-elev); border: 0.5px solid var(--color-line); border-radius: 14px; padding: 18px;">
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
