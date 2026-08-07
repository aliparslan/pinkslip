<script lang="ts">
  import { tick } from "svelte";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import X from "phosphor-svelte/lib/X";
  import { headerChrome } from "../lib/header-chrome.svelte";

  let {
    visible = true,
    expanded = $bindable(false),
    ownerId,
  }: {
    visible?: boolean;
    expanded?: boolean;
    ownerId?: string;
  } = $props();

  let input: HTMLInputElement | undefined = $state();
  let toggle: HTMLButtonElement | undefined = $state();
  let previousRegistrationId: string | null = null;
  let registration = $derived(
    headerChrome.search?.id === ownerId ? headerChrome.search : null,
  );
  let value = $derived(registration?.value() ?? "");

  async function open() {
    if (!registration) return;
    expanded = true;
    await tick();
    input?.focus({ preventScroll: true });
  }

  async function close() {
    expanded = false;
    await tick();
    toggle?.focus({ preventScroll: true });
  }

  function clearOrClose() {
    if (!registration) return;
    if (value) {
      registration.onInput("");
      registration.onSubmit?.("");
      input?.focus({ preventScroll: true });
      return;
    }
    void close();
  }

  function commit(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      void close();
      return;
    }
    if (event.key !== "Enter" || !registration) return;
    event.preventDefault();
    registration.onSubmit?.(event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : value);
    input?.blur();
  }

  $effect(() => {
    const id = registration?.id ?? null;
    if (id !== previousRegistrationId) expanded = false;
    previousRegistrationId = id;
  });
</script>

{#if registration}
  <div class="header-search" class:expanded>
    {#if expanded}
      <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
      <input
        bind:this={input}
        type="search"
        enterkeyhint="search"
        aria-label={registration.placeholder}
        placeholder={registration.placeholder}
        {value}
        oninput={(event) => registration?.onInput(event.currentTarget.value)}
        onkeydown={commit}
      />
      <button
        type="button"
        aria-label={value ? "Clear search" : "Close search"}
        onclick={clearOrClose}
      >
        <X size={18} weight="bold" aria-hidden="true" />
      </button>
    {:else if visible}
      <button
        bind:this={toggle}
        type="button"
        class="header-search__toggle"
        aria-label={registration.placeholder}
        onclick={open}
      >
        <MagnifyingGlass size={20} weight="bold" aria-hidden="true" />
      </button>
    {/if}
  </div>
{/if}

<style>
  .header-search {
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .header-search.expanded {
    width: 100%;
    gap: var(--space-2);
    padding-inline-start: var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-input-bg);
    color: var(--color-ink-3);
  }

  .header-search__toggle,
  .header-search.expanded button {
    width: var(--tap-min);
    height: var(--tap-min);
    flex: none;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
  }

  input {
    min-width: 0;
    width: 100%;
    height: var(--tap-min);
    padding: 0;
    border: 0;
    appearance: none;
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    font-size: var(--fs-md);
  }

  input::placeholder { color: var(--color-ink-4); }
  input:focus-visible { outline: none; }

  .header-search.expanded:has(input:focus-visible) {
    border-color: var(--color-accent);
  }
</style>
