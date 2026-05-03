<script lang="ts">
  import { api } from "../lib/api";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  let name: string = $state("");
  let saving: boolean = $state(false);

  async function handleNameSubmit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    saving = true;
    try {
      await api.me.update({ name: trimmed });
      onComplete(trimmed);
    } catch {
      saving = false;
    }
  }
</script>

<div style="position: fixed; inset: 0; z-index: 60; background: var(--color-bg); display: flex; align-items: center; justify-content: center;">
  <div style="width: 100%; max-width: 360px; padding: 32px;">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <svg width="32" height="38" viewBox="0 0 22 26" fill="none" aria-hidden="true" style="transform: rotate(-8deg); flex-shrink: 0;">
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
      Get alerted the moment roles drop &mdash; before everyone else applies.
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
      {saving ? "..." : "Get started"}
    </button>
  </div>
</div>
