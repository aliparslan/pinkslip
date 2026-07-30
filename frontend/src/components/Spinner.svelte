<script lang="ts">
  // Inherits currentColor so it matches whatever text it sits beside; uses the
  // global .spin keyframes from app.css.
  let { size = 16, label }: { size?: number; label?: string } = $props();
</script>

<svg
  class="spin"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  role={label ? "status" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : true}
>
  <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" />
  <path d="M8 1.5 A 6.5 6.5 0 0 1 14.5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
</svg>
