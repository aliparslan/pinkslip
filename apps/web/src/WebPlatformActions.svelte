<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "../../../packages/client/src/components/Modal.svelte";
  import {
    applyWebUpdate,
    getWebEnvironment,
    isIosWebBrowser,
    promptWebInstall,
    webEnvironment,
    type WebEnvironmentSnapshot,
  } from "./lib/web-environment";

  let { compactInstall = false }: { compactInstall?: boolean } = $props();

  let environment = $state<WebEnvironmentSnapshot>(getWebEnvironment());
  let installHelpOpen = $state(false);
  let installing = $state(false);
  let updating = $state(false);
  let actionError = $state("");
  const iosBrowser = isIosWebBrowser();
  let canOfferInstall = $derived(
    !environment.installed
      && (environment.installAvailable || (iosBrowser && environment.displayMode === "browser"))
  );

  onMount(() => {
    const unsubscribe = webEnvironment.subscribe((next) => {
      environment = next;
    });
    const showInstallHelp = () => {
      installHelpOpen = true;
    };
    window.addEventListener("pinkslip:install-help", showInstallHelp);
    return () => {
      unsubscribe();
      window.removeEventListener("pinkslip:install-help", showInstallHelp);
    };
  });

  async function install() {
    if (installing) return;
    installing = true;
    actionError = "";
    try {
      const result = await promptWebInstall();
      if (result === "unavailable") installHelpOpen = true;
    } catch {
      actionError = "Installation isn’t available right now.";
    } finally {
      installing = false;
    }
  }

  async function update() {
    if (updating) return;
    updating = true;
    actionError = "";
    try {
      if (!await applyWebUpdate()) {
        actionError = "The update is still downloading. Try again in a moment.";
      }
    } catch {
      actionError = "Pinkslip couldn’t apply the update yet.";
    } finally {
      updating = false;
    }
  }
</script>

{#if canOfferInstall}
  <aside
    class="web-platform-install"
    data-compact-install={compactInstall ? "true" : "false"}
    aria-label="Install Pinkslip"
  >
    <div>
      <strong>Use Pinkslip as an app</strong>
      <span>Keep it within easy reach.</span>
    </div>
    <button class="btn-secondary btn-mini" type="button" disabled={installing} onclick={() => void install()}>
      {installing ? "Opening…" : "Install"}
    </button>
  </aside>
{/if}

{#if environment.updateAvailable}
  <aside class="web-update-prompt" aria-label="Pinkslip update available">
    <div>
      <strong>Update available</strong>
      <span>Reload when you’re ready.</span>
    </div>
    <button class="btn-primary btn-accent btn-mini" type="button" disabled={updating} onclick={() => void update()}>
      {updating ? "Updating…" : "Update"}
    </button>
  </aside>
{/if}

{#if actionError}
  <p class="web-platform-action-error" role="alert">{actionError}</p>
{/if}

{#if installHelpOpen}
  <Modal
    title="Install Pinkslip"
    subtitle={iosBrowser
      ? "Safari installs web apps from the Share menu."
      : "Use your browser’s install command to add Pinkslip to this device."}
    onclose={() => (installHelpOpen = false)}
  >
    <div class="web-install-help">
      {#if iosBrowser}
        <ol>
          <li>Open Pinkslip in Safari.</li>
          <li>Tap Share, then Add to Home Screen.</li>
          <li>Open Pinkslip from your Home Screen. You can then enable notifications from You.</li>
        </ol>
      {:else}
        <p>Open your browser menu and choose Install Pinkslip or Add to Home Screen.</p>
      {/if}
      <button class="btn-primary btn-accent full-width" type="button" onclick={() => (installHelpOpen = false)}>
        Got it
      </button>
    </div>
  </Modal>
{/if}
