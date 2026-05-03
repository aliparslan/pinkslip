<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { companyMark } from "../lib/utils";
  import { navigate } from "../router";
  import { registerPush } from "../lib/push";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import Wrench from "phosphor-svelte/lib/Wrench";

  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let pushStatus: string = $state("disabled");
  let enablingPush: boolean = $state(false);
  let testingNotif: string | null = $state(null);
  let successMsg: string | null = $state(null);

  let prefs: any = $state({});
  let userName: string = $state("");
  let skills: string[] = $state(["TypeScript", "React", "Svelte", "Python", "Node.js", "Swift"]);
  let resumeCompletion: number = $state(0);

  let initials = $derived(userName ? companyMark(userName) : "?");

  let stats = $derived([
    { label: "Apps sent", value: 0, sub: "this week" },
    { label: "Replies", value: 0, sub: "—" },
    { label: "Interviews", value: 0, sub: "in pipeline" },
  ]);

  onMount(() => {
    loading = true;
    Promise.all([api.preferences.get(), api.me.get()])
      .then(([p, me]) => {
        prefs = p;
        userName = me.user?.name ?? "";
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

  let settingsRows = $derived([
    { label: "Job preferences", sub: "Locations, keywords, YOE", path: null, wip: true },
    { label: "Companies", sub: "Manage tracked sources", path: "/profile/companies", wip: false },
    { label: "Notifications", sub: pushStatus === "enabled" ? "Push enabled" : "Push disabled", path: null, wip: true },
    { label: "Resume & cover letters", sub: "Coming soon", path: null, wip: true },
  ]);
</script>

<div class="page">
  <div style="padding: 0 22px 28px;">
    <p class="h-eyebrow" style="margin-bottom: 6px;">Profile</p>

    {#if loading}
      <!-- Hero skeleton -->
      <div style="padding: 20px 18px; border-radius: 18px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 20px;">
        <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 16px;">
          <div class="skeleton" style="width: 56px; height: 56px; border-radius: 14px;"></div>
          <div style="flex: 1;">
            <div class="skeleton" style="width: 55%; height: 18px; margin-bottom: 6px;"></div>
            <div class="skeleton" style="width: 35%; height: 12px;"></div>
          </div>
        </div>
        <div class="skeleton" style="width: 100%; height: 4px; border-radius: 999px;"></div>
      </div>
      <!-- Stats skeleton -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 24px;">
        {#each Array(3) as _}
          <div style="padding: 14px 12px; border-radius: 14px; background: var(--color-bg-elev); border: 1px solid var(--color-line);">
            <div class="skeleton" style="width: 40px; height: 22px; margin-bottom: 8px;"></div>
            <div class="skeleton" style="width: 60%; height: 10px;"></div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Hero card -->
      <div style="padding: 20px 18px; border-radius: 18px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 20px;">
        <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 16px;">
          <div class="logo-mark" style="width: 56px; height: 56px; font-size: 22px; border-radius: 14px; background: var(--color-accent); color: var(--color-accent-ink); border-color: transparent; font-family: var(--font-display); font-weight: 700;">
            {initials}
          </div>
          <div style="flex: 1; min-width: 0;">
            <h2 class="h-display" style="font-size: 22px; margin-bottom: 2px;">{userName || "Set your name"}</h2>
            <div style="font-size: 13px; color: var(--color-ink-3);">
              Software Engineer
            </div>
          </div>
        </div>
        <!-- Resume completion -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
          <span style="font-size: 12px; color: var(--color-ink-3); font-family: var(--font-mono);">Resume {resumeCompletion}% complete</span>
          <button style="appearance: none; border: 0; background: transparent; cursor: pointer; font-family: var(--font-sans); font-size: 12px; color: var(--color-accent-soft-ink); font-weight: 500;">
            Finish &rarr;
          </button>
        </div>
        <div style="height: 4px; border-radius: 999px; background: var(--color-line); overflow: hidden;">
          <div style="width: {resumeCompletion}%; height: 100%; background: var(--color-accent); transition: width 0.3s;"></div>
        </div>
      </div>

      <!-- Stats -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 24px;">
        {#each stats as s}
          <div style="padding: 14px 12px; border-radius: 14px; background: var(--color-bg-elev); border: 1px solid var(--color-line);">
            <div style="font-family: var(--font-mono); font-size: 24px; font-weight: 600; letter-spacing: -0.025em; line-height: 1;">
              {s.value}
            </div>
            <div style="font-size: 11.5px; color: var(--color-ink-2); margin-top: 6px; font-weight: 500;">{s.label}</div>
            <div style="font-size: 10.5px; color: var(--color-ink-4); margin-top: 2px; font-family: var(--font-mono);">{s.sub}</div>
          </div>
        {/each}
      </div>

      <!-- Skills -->
      <h3 class="h-eyebrow" style="margin-bottom: 10px;">Skills on resume</h3>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 24px;">
        {#each skills as skill}
          <span class="tag">{skill}</span>
        {/each}
        <button class="tag" style="background: transparent; border: 0.5px dashed var(--color-line-2); color: var(--color-ink-3); cursor: pointer;">
          + add
        </button>
      </div>

      <!-- Account settings -->
      <h3 class="h-eyebrow" style="margin-bottom: 10px;">Account</h3>
      <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 20px;">
        {#each settingsRows as row, i}
          <button
            style="appearance: none; border: 0; background: transparent; cursor: pointer; width: 100%; text-align: left; padding: 14px 16px; display: flex; align-items: center; gap: 12px; {i > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''} color: inherit;"
            onclick={() => row.path && navigate(row.path)}
          >
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 500;">{row.label}</div>
              <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">{row.sub}</div>
            </div>
            {#if row.wip}
              <Wrench size={14} color="var(--color-ink-4)" />
            {:else}
              <CaretRight size={16} color="var(--color-ink-4)" />
            {/if}
          </button>
        {/each}
      </div>

      <!-- Push & test notifications -->
      <h3 class="h-eyebrow" style="margin-bottom: 10px;">Notifications</h3>
      <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 20px;">
        <div style="padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 14px; font-weight: 500;">Push notifications</div>
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
        <div style="padding: 14px 16px;">
          {#if testingNotif}
            <div style="padding: 10px 14px; border-radius: 10px; background: color-mix(in oklch, var(--color-accent) 14%, transparent); color: var(--color-accent-soft-ink); font-family: var(--font-mono); font-size: 12px; margin-bottom: 12px;">
              {testingNotif}
            </div>
          {/if}
          {#if successMsg}
            <div style="padding: 10px 14px; border-radius: 10px; background: color-mix(in oklch, var(--color-good) 14%, transparent); color: var(--color-good); font-size: 13px; margin-bottom: 12px;">
              {successMsg}
            </div>
          {/if}
          {#if error}
            <div style="padding: 10px 14px; border-radius: 10px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 13px; margin-bottom: 12px;">
              {error}
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
                  setTimeout(() => { successMsg = null; }, 3000);
                } catch (e: any) {
                  testingNotif = null;
                  error = e.message;
                }
              }}
            >
              Test now
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
                  setTimeout(() => { successMsg = null; }, 3000);
                } catch (e: any) {
                  testingNotif = null;
                  error = e.message;
                }
              }}
            >
              Test in 5s
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
