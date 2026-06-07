<script lang="ts">
  // Headless single-value slider from Bits UI (keyboard, ARIA, drag) wearing our
  // `.slider` styling from app.css. See components/Switch.svelte for the pattern.
  import { Slider } from "bits-ui";

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    onValueCommit,
    ...rest
  }: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    onValueCommit?: (value: number) => void;
    [key: string]: unknown;
  } = $props();
</script>

<Slider.Root type="single" bind:value {min} {max} {step} {onValueCommit} {...rest} class="slider">
  {#snippet children()}
    <Slider.Range class="slider__range" />
    <Slider.Thumb index={0} class="slider__thumb" />
  {/snippet}
</Slider.Root>
