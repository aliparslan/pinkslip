<script lang="ts">
  import { api } from "../lib/api";
  import { registerPush } from "../lib/push";
  import { enableNativePush, isNativeIos } from "../lib/native-push";
  import Wrench from "phosphor-svelte/lib/Wrench";
  import Check from "phosphor-svelte/lib/Check";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  let step: number = $state(1);
  let name: string = $state("");
  let saving: boolean = $state(false);
  let pushStatus: string = $state("idle");
  let enablingPush: boolean = $state(false);

  const roles = [
    "Software Engineer",
    "Frontend Engineer",
    "Backend Engineer",
    "Full Stack Engineer",
    "iOS / Android Engineer",
    "Data / ML Engineer",
  ];

  const locations = [
    "Remote",
    "San Francisco / Bay Area",
    "New York, NY",
    "Chicago, IL",
    "Boston, MA",
    "Washington, DC",
    "Seattle, WA",
    "Austin, TX",
  ];

  const sources = [
    { name: "Greenhouse", abbr: "gh", wip: false },
    { name: "Lever", abbr: "lv", wip: false },
    { name: "Ashby", abbr: "ab", wip: false },
    { name: "Otta", abbr: "ot", wip: true },
    { name: "Workday", abbr: "wd", wip: true },
    { name: "LinkedIn", abbr: "in", wip: true },
    { name: "Indeed", abbr: "id", wip: true },
    { name: "YC Jobs", abbr: "yc", wip: true },
    { name: "Wellfound", abbr: "wf", wip: true },
  ];

  async function handleNameSubmit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    saving = true;
    try {
      await api.me.update({ name: trimmed });
      saving = false;
      step = 2;
    } catch {
      saving = false;
    }
  }

  async function handleEnablePush() {
    enablingPush = true;
    try {
      // Native iOS app → APNs; web → Web Push.
      const ok = isNativeIos()
        ? (await enableNativePush()) === "enabled"
        : await registerPush();
      pushStatus = ok ? "enabled" : "denied";
    } catch {
      pushStatus = "error";
    } finally {
      enablingPush = false;
    }
  }

  function finish() {
    onComplete(name.trim());
  }
</script>

<div style="position: fixed; inset: 0; z-index: 30; background: var(--color-bg); display: flex; flex-direction: column; padding-top: var(--safe-top); padding-bottom: var(--safe-bottom); overscroll-behavior: contain;">
  <!-- Progress bars pinned to top (clear of the status bar / Dynamic Island) -->
  <div style="padding: 20px 24px 4px; flex-shrink: 0;">
    <div style="display: flex; gap: 6px;">
      {#each [1, 2, 3, 4, 5] as s}
        <div style="height: 3px; flex: 1; border-radius: 999px; background: {s <= step ? 'var(--color-accent)' : 'var(--color-line)'}; transition: background 0.3s;"></div>
      {/each}
    </div>
  </div>

  <!-- Content: scroll region; margin auto centers it but stays scroll-safe when tall -->
  <div style="flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; align-items: center; padding: 24px 32px 40px;">
    <div style="width: 100%; max-width: 360px; margin: auto 0;">

      {#if step === 1}
        <div style="animation: fade-in 0.3s;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <svg width="32" height="38" viewBox="0 0 22 26" fill="none" style="transform: rotate(-8deg); flex-shrink: 0;">
              <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
              <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
            </svg>
            <span class="h-display" style="font-size: 30px; line-height: 1;">
              <span style="color: var(--color-accent);">pink</span>slip
            </span>
          </div>
          <h2 class="h-display" style="font-size: 26px; margin-bottom: 8px;">Beat the crowd</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 32px;">
            Get alerted the moment roles drop &mdash; before everyone else applies. We scan company job boards every 15 minutes so you never miss a match.
          </p>
          <label for="onboarding-name" class="field-label" style="margin-bottom: 8px;">
            Your name
          </label>
          <input
            id="onboarding-name"
            class="input-field"
            type="text"
            placeholder="e.g. Alex"
            bind:value={name}
            onkeydown={(e) => e.key === "Enter" && handleNameSubmit()}
          />
          <button
            class="btn-primary btn-accent"
            style="width: 100%; margin-top: 16px;"
            disabled={!name.trim() || saving}
            onclick={handleNameSubmit}
          >
            {saving ? "..." : "Continue"}
          </button>
        </div>

      {:else if step === 2}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">What kind of work?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            We score every listing against your target roles. Customization coming soon.
          </p>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px;">
            {#each roles as role}
              <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--color-bg-sunken); border: 1px solid var(--color-line);">
                <span style="flex: 1; font-size: 14px; font-weight: 500;">{role}</span>
                <Wrench size={14} color="var(--color-ink-3)" />
              </div>
            {/each}
          </div>
          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 3}>
            Continue
          </button>
        </div>

      {:else if step === 3}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Where to?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            We prioritize jobs in your cities. Customization coming soon.
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">
            {#each locations as loc}
              <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px; background: var(--color-bg-sunken); border: 1px solid var(--color-line);">
                <span style="font-size: 14px; font-weight: 500;">{loc}</span>
                <Wrench size={12} color="var(--color-ink-3)" />
              </div>
            {/each}
          </div>
          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 4}>
            Continue
          </button>
        </div>

      {:else if step === 4}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Connected</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            We scan these sources every 15 minutes and push-notify you when something matches.
          </p>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 24px;">
            {#each sources as source, i}
              <div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; {i > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
                <div class="logo-mark" style="width: 36px; height: 36px; font-size: 11px; border-radius: 9px; background: var(--color-accent-soft); color: var(--color-accent-soft-ink); border-color: transparent;">
                  {source.abbr}
                </div>
                <span style="flex: 1; font-size: 14px; font-weight: 500;">{source.name}</span>
                {#if source.wip}
                  <Wrench size={14} color="var(--color-ink-3)" />
                {:else}
                  <Check size={16} weight="bold" color="var(--color-good)" />
                {/if}
              </div>
            {/each}
          </div>

          <div style="padding: 16px; border-radius: 14px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 500; margin-bottom: 2px;">Upload resume</div>
              <div style="font-size: 12px; color: var(--color-ink-3);">For tailored scoring & cover letters</div>
            </div>
            <Wrench size={14} color="var(--color-ink-3)" />
          </div>

          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 5}>
            Continue
          </button>
        </div>

      {:else if step === 5}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Stay in the loop</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Add <span class="brand-word"><span class="brand-word-pink">pink</span>slip</span> to your homescreen and enable notifications so you never miss a match.
          </p>

          <!-- Add to homescreen instructions -->
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 16px;">
            <div style="padding: 16px;">
              <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">Add to homescreen</div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <div style="width: 22px; height: 22px; border-radius: 6px; background: var(--color-accent-soft); color: var(--color-accent-soft-ink); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px;">1</div>
                  <div style="font-size: 13.5px; color: var(--color-ink-2); line-height: 1.5;">
                    Tap the <strong style="color: var(--color-ink);">Share</strong> button in your browser
                    <span style="font-size: 12px; color: var(--color-ink-3); display: block; margin-top: 2px; font-family: var(--font-mono);">
                      (square with arrow on Safari)
                    </span>
                  </div>
                </div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <div style="width: 22px; height: 22px; border-radius: 6px; background: var(--color-accent-soft); color: var(--color-accent-soft-ink); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px;">2</div>
                  <div style="font-size: 13.5px; color: var(--color-ink-2); line-height: 1.5;">
                    Scroll down and tap <strong style="color: var(--color-ink);">Add to Home Screen</strong>
                  </div>
                </div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <div style="width: 22px; height: 22px; border-radius: 6px; background: var(--color-accent-soft); color: var(--color-accent-soft-ink); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px;">3</div>
                  <div style="font-size: 13.5px; color: var(--color-ink-2); line-height: 1.5;">
                    Tap <strong style="color: var(--color-ink);">Add</strong> to confirm
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Push notifications -->
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 24px;">
            <div style="padding: 16px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 14px; font-weight: 600;">Push notifications</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Get alerted for high-scoring jobs</div>
              </div>
              {#if pushStatus === "enabled"}
                <span style="font-family: var(--font-mono); font-size: 12px; color: var(--color-good); font-weight: 500;">Enabled</span>
              {:else}
                <button
                  class="btn-secondary"
                  style="height: 34px; padding: 0 16px; font-size: 13px;"
                  disabled={enablingPush}
                  onclick={handleEnablePush}
                >
                  {enablingPush ? "..." : "Enable"}
                </button>
              {/if}
            </div>
            {#if pushStatus === "denied"}
              <div style="padding: 0 16px 14px;">
                <div style="padding: 8px 12px; border-radius: 8px; background: color-mix(in oklch, var(--color-warn) 14%, transparent); color: var(--color-warn); font-size: 12px; line-height: 1.4;">
                  Permission denied. {isNativeIos() ? "Turn on notifications for pinkslip in the iOS Settings app." : "You can enable notifications in your browser settings."}
                </div>
              </div>
            {/if}
            {#if pushStatus === "error"}
              <div style="padding: 0 16px 14px;">
                <div style="padding: 8px 12px; border-radius: 8px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px; line-height: 1.4;">
                  Something went wrong. You can set up notifications later in Settings.
                </div>
              </div>
            {/if}
          </div>

          <button class="btn-primary btn-accent" style="width: 100%;" onclick={finish}>
            Get started
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>
