<script lang="ts">
  let {
    size = 26,
    label,
  }: {
    size?: number;
    label?: string;
  } = $props();
</script>

<svg
  class="brand-mark"
  width={size}
  height={Math.round(size * 1.08)}
  viewBox="0 0 24 26"
  fill="none"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
>
  <g transform="rotate(-6 12 13)">
    <rect x="2" y="1" width="20" height="24" rx="3" fill="currentColor" />
    <path d="M7 7.5h10M7 12h7.5M7 16.5h9" stroke="var(--color-accent-ink)" stroke-width="1.5" stroke-linecap="round" opacity="0.52" />
  </g>
</svg>

<style>
  .brand-mark {
    display: block;
    flex: none;
    color: var(--color-accent);
  }
</style>
