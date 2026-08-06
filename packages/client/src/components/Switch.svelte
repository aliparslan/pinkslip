<script lang="ts">
  // Headless toggle from Bits UI (focus, keyboard, role="switch", ARIA) wearing
  // our own `.switch` styling from app.css. Behaviour is library-owned; looks ours.
  import { Switch, type WithoutChildrenOrChild } from "bits-ui";

  let {
    checked = $bindable(false),
    ...restProps
  }: WithoutChildrenOrChild<Switch.RootProps> = $props();
</script>

<Switch.Root bind:checked {...restProps} class="switch">
  <Switch.Thumb class="switch-thumb" />
</Switch.Root>
