<script lang="ts">
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { feedback } from "../lib/feedback.svelte";
  import { prefersReducedMotion } from "../lib/motion";
  import Toast from "./Toast.svelte";

  const reduceMotion = prefersReducedMotion();
  const stackMotion = { duration: reduceMotion ? 1 : 180, easing: cubicOut };
  const enterMotion = { y: reduceMotion ? 0 : 12, duration: reduceMotion ? 1 : 180, easing: cubicOut };
  const exitMotion = { y: reduceMotion ? 0 : 8, duration: reduceMotion ? 1 : 140, easing: cubicOut };
</script>

<div class="toast-viewport">
  {#each feedback.visible as toast (toast.id)}
    <div class="toast-slot" animate:flip={stackMotion}>
      <div class="toast-presence" in:fly={enterMotion} out:fly={exitMotion}>
        <Toast {toast} />
      </div>
    </div>
  {/each}
</div>

<style>
  .toast-viewport {
    position: fixed;
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--overlay-bottom-offset);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: var(--space-2);
    pointer-events: none;
  }

  .toast-slot,
  .toast-presence {
    width: min(100%, 440px);
  }

  .toast-slot {
    will-change: transform;
  }

  @media (min-width: 900px) {
    .toast-viewport {
      left: auto;
      right: var(--space-6);
      bottom: var(--space-6);
      align-items: flex-end;
    }
  }
</style>
