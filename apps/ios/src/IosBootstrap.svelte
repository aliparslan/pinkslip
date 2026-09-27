<script lang="ts">
  import { onMount } from "svelte";
  import BrandLoading from "../../../packages/client/src/components/BrandLoading.svelte";
  import PageFailure from "../../../packages/client/src/components/PageFailure.svelte";
  import IosApp from "./IosApp.svelte";
  import { initializeIosPlatform } from "./platform";

  let platformReady = $state(false);
  let platformFailed = $state(false);

  function reloadApp(): void {
    window.location.reload();
  }

  function reportAppRenderError(error: unknown): void {
    console.error("The iOS application shell failed while rendering:", error);
  }

  onMount(() => {
    let cancelled = false;
    void initializeIosPlatform()
      .then(() => {
        if (!cancelled) platformReady = true;
      })
      .catch((error) => {
        console.error("iOS platform initialization failed:", error);
        if (!cancelled) platformFailed = true;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

{#snippet appFailure(_error: unknown, _reset: () => void)}
  <main class="boot-error-wrap native-session-failure">
    <PageFailure
      title="Pinkslip ran into a problem"
      message="Close and reopen the app, or try loading it again."
      onRetry={reloadApp}
    />
  </main>
{/snippet}

{#if platformReady}
  <svelte:boundary onerror={reportAppRenderError} failed={appFailure}>
    <IosApp />
  </svelte:boundary>
{:else if platformFailed}
  <main class="boot-error-wrap native-session-failure">
    <PageFailure
      title="Pinkslip couldn’t start"
      message="Check your connection, then try again."
      onRetry={reloadApp}
    />
  </main>
{:else}
  <BrandLoading label="Starting Pinkslip" />
{/if}
