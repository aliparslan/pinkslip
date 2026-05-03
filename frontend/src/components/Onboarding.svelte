<script lang="ts">
  import { api } from "../lib/api";
  import Wrench from "phosphor-svelte/lib/Wrench";
  import Check from "phosphor-svelte/lib/Check";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  let step: number = $state(1);
  let name: string = $state("");
  let saving: boolean = $state(false);

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

  function finish() {
    onComplete(name.trim());
  }
</script>

<div style="position: fixed; inset: 0; z-index: 60; background: var(--color-bg); display: flex; flex-direction: column; overflow-y: auto;">
  <!-- Progress bars pinned to top -->
  <div style="padding: 12px 24px 0; flex-shrink: 0;">
    <div style="display: flex; gap: 6px;">
      {#each [1, 2, 3, 4] as s}
        <div style="height: 3px; flex: 1; border-radius: 999px; background: {s <= step ? 'var(--color-accent)' : 'var(--color-line)'}; transition: background 0.3s;"></div>
      {/each}
    </div>
  </div>

  <!-- Content centered -->
  <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px 32px 48px;">
    <div style="width: 100%; max-width: 360px;">

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
          <p style="font-size: 14.5px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 32px;">
            Get alerted the moment roles drop &mdash; before everyone else applies. We scan company job boards every 15 minutes so you never miss a match.
          </p>
          <label for="onboarding-name" style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: block;">
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
          <p class="h-eyebrow" style="margin-bottom: 6px;">Roles</p>
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">What kind of work?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            We score every listing against your target roles. Customization coming soon.
          </p>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px;">
            {#each roles as role}
              <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--color-bg-sunken); border: 1px solid var(--color-line);">
                <span style="flex: 1; font-size: 14px; font-weight: 500;">{role}</span>
                <Wrench size={14} color="var(--color-ink-4)" />
              </div>
            {/each}
          </div>
          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 3}>
            Continue
          </button>
        </div>

      {:else if step === 3}
        <div style="animation: fade-in 0.3s;">
          <p class="h-eyebrow" style="margin-bottom: 6px;">Locations</p>
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Where to?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            We prioritize jobs in your cities. Customization coming soon.
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">
            {#each locations as loc}
              <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px; background: var(--color-bg-sunken); border: 1px solid var(--color-line);">
                <span style="font-size: 14px; font-weight: 500;">{loc}</span>
                <Wrench size={12} color="var(--color-ink-4)" />
              </div>
            {/each}
          </div>
          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 4}>
            Continue
          </button>
        </div>

      {:else if step === 4}
        <div style="animation: fade-in 0.3s;">
          <p class="h-eyebrow" style="margin-bottom: 6px;">Last one</p>
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
                <span style="flex: 1; font-size: 14.5px; font-weight: 500;">{source.name}</span>
                {#if source.wip}
                  <Wrench size={14} color="var(--color-ink-4)" />
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
            <Wrench size={14} color="var(--color-ink-4)" />
          </div>

          <button class="btn-primary btn-accent" style="width: 100%;" onclick={finish}>
            Get started
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>
