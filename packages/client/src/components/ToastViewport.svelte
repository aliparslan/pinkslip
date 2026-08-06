<script lang="ts">
  import { feedback } from "../lib/feedback.svelte";
  import Toast from "./Toast.svelte";
</script>

<div class="toast-viewport">
  {#each feedback.visible as toast (toast.id)}
    <Toast {toast} />
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

  @media (min-width: 900px) {
    .toast-viewport {
      left: auto;
      right: var(--space-6);
      bottom: var(--space-6);
      align-items: flex-end;
    }
  }
</style>
