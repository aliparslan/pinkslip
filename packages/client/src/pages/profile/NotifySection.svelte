<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "@pinkslip/core/api";
  import { errorMessage } from "@pinkslip/core/utils";
  import { enableNativePush, getNativePushStatus } from "../../lib/native-push";
  import { platform, type NotificationStatus } from "../../lib/platform";
  import Switch from "../../components/Switch.svelte";
  import Spinner from "../../components/Spinner.svelte";

  let {
    notificationEnabled = $bindable(),
    pushStatus = $bindable(),
    onError,
    onSuccess,
    showHeading = true,
    nativeIos = false,
  }: {
    notificationEnabled: boolean;
    pushStatus: NotificationStatus;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    showHeading?: boolean;
    nativeIos?: boolean;
  } = $props();

  let enablingPush: boolean = $state(false);
  let refreshingPush: boolean = $state(false);
  let openingSettings: boolean = $state(false);
  let testingDelay: number | null = $state(null);
  let pushRegistrationFailed: boolean = $state(false);
  let awaitingSettingsPermission: boolean = $state(false);
  let pushDenied = $derived(pushStatus === "denied");
  let pushRequiresInstall = $derived(pushStatus === "requires-install");
  let pushUnsupported = $derived(pushStatus === "unsupported");

  async function refreshNativePushStatus() {
    if (!nativeIos || refreshingPush) return;
    refreshingPush = true;
    const completingSettingsFlow = awaitingSettingsPermission;
    awaitingSettingsPermission = false;
    try {
      pushStatus = await getNativePushStatus();
      if (pushStatus !== "enabled") pushRegistrationFailed = false;
      if (pushStatus === "enabled" && completingSettingsFlow) {
        // Permission can change while the app is backgrounded. The status check
        // alone does not register this installation with APNs, so finish that
        // handshake before reflecting the setting as usable.
        await enableNativePush();
        pushRegistrationFailed = false;
        notificationEnabled = true;
      }
    } catch (e) {
      pushRegistrationFailed = pushStatus === "enabled";
      onError(errorMessage(e, "Notifications are allowed, but this device could not register. Tap Retry to try again."));
    } finally {
      refreshingPush = false;
    }
  }

  async function handleEnablePush() {
    enablingPush = true;
    try {
      const result = await enableNativePush();
      const ok = result === "enabled";
      pushStatus = result;
      pushRegistrationFailed = false;
      if (ok) notificationEnabled = true;
      if (result === "requires-install") {
        onError("Install Pinkslip from your browser before enabling notifications.");
      } else if (result === "unsupported") {
        onError("Push notifications aren’t supported in this browser.");
      } else if (result === "denied" && !nativeIos) {
        onError("Allow notifications in your browser’s site settings.");
      }
    } catch (e) {
      pushStatus = await getNativePushStatus().catch(() => pushStatus);
      pushRegistrationFailed = pushStatus === "enabled";
      onError(errorMessage(e));
    } finally {
      enablingPush = false;
    }
  }

  async function handleOpenSettings() {
    if (openingSettings) return;
    openingSettings = true;
    awaitingSettingsPermission = true;
    try {
      await platform().notifications.openSettings();
    } catch (e) {
      awaitingSettingsPermission = false;
      onError(errorMessage(e, nativeIos ? "Could not open iOS Settings." : "Could not show installation help."));
    } finally {
      openingSettings = false;
    }
  }

  async function sendTest(delaySeconds: number) {
    if (testingDelay !== null) return;
    testingDelay = delaySeconds;
    try {
      const res = await api.push.test(delaySeconds);
      onSuccess(res.sent > 0 ? "Test notification sent." : "No registered device received the test.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      testingDelay = null;
    }
  }

  onMount(() => {
    if (!nativeIos) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshNativePushStatus();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  });
</script>

<section>
  {#if showHeading}<h2 class="section-eyebrow">Notifications</h2>{/if}
  <div class="surface-list notification-settings">
    <div class="grouped-row">
      <div class="grouped-row-copy">
        <div class="row-title">{nativeIos ? "Send new job alerts" : "Job alerts"}</div>
        {#if !nativeIos}<div class="helper-text">Pause or resume all job alerts</div>{/if}
      </div>
      <Switch
        checked={notificationEnabled}
        onCheckedChange={(value) => (notificationEnabled = value)}
        aria-label={nativeIos ? "Send new job alerts" : "Job alerts"}
      />
    </div>

    <div class="grouped-row">
      <div class="grouped-row-copy">
        <div class="row-title">Push notifications</div>
        {#if pushRegistrationFailed}
          <div class="helper-text">Permission is allowed. Finish device setup.</div>
        {:else if pushDenied && nativeIos}
          <div class="helper-text">Allow alerts in iOS Settings.</div>
        {:else if pushDenied}
          <div class="helper-text">Allow notifications in your browser’s site settings.</div>
        {:else if pushRequiresInstall}
          <div class="helper-text">Install Pinkslip to receive notifications on this device.</div>
        {:else if pushUnsupported}
          <div class="helper-text">Push notifications aren’t available in this browser.</div>
        {:else if !nativeIos}
          <div class="helper-text">Get notified about relevant new jobs</div>
        {/if}
      </div>
      <div class="field-action">
        <span class="setting-status" class:good={pushStatus === "enabled" && !pushRegistrationFailed} class:denied={pushDenied}>
          {pushRegistrationFailed
            ? "Needs setup"
            : pushStatus === "enabled"
              ? nativeIos ? "Allowed" : "On"
              : pushDenied
                ? "Denied"
                : pushRequiresInstall
                  ? "Install required"
                  : pushUnsupported
                    ? "Unavailable"
                    : "Off"}
        </span>
        {#if pushRegistrationFailed}
          <button
            class="btn-secondary btn-mini"
            disabled={enablingPush || refreshingPush}
            onclick={handleEnablePush}
          >
            {#if enablingPush || refreshingPush}<Spinner />{/if}
            Retry
          </button>
        {:else if pushDenied && nativeIos}
          <button
            class="btn-secondary btn-mini"
            disabled={openingSettings}
            onclick={handleOpenSettings}
          >
            {#if openingSettings}<Spinner />{/if}
            Open Settings
          </button>
        {:else if pushRequiresInstall}
          <button
            class="btn-secondary btn-mini"
            disabled={openingSettings}
            onclick={handleOpenSettings}
          >
            {#if openingSettings}<Spinner />{/if}
            Install
          </button>
        {:else if pushStatus !== "enabled" && !pushDenied && !pushUnsupported}
          <button
            class="btn-secondary btn-mini"
            disabled={enablingPush}
            onclick={handleEnablePush}
          >
            {#if enablingPush}<Spinner />{/if}
            Enable
          </button>
        {/if}
      </div>
    </div>

    {#if pushStatus === "enabled" && !pushRegistrationFailed}
      <div class="grouped-row stack test-notification-row">
        <div class="grouped-row-copy">
          <div class="row-title">{nativeIos ? "Send a test" : "Test notification"}</div>
          {#if !nativeIos}<div class="helper-text">Make sure alerts reach this device</div>{/if}
          <span class="test-notification-status" role="status" aria-live="polite">
            {testingDelay === null ? "" : testingDelay > 0 ? "Scheduling test notification" : "Sending test notification"}
          </span>
        </div>
        <div class="button-cluster">
          <button
            type="button"
            class="btn-secondary btn-mini"
            disabled={testingDelay !== null}
            aria-busy={testingDelay === 0}
            onclick={() => sendTest(0)}
          >
            <span class="test-button-content" class:loading={testingDelay === 0}>
              <span class="test-button-label">Send now</span>
              {#if testingDelay === 0}<span class="test-button-spinner"><Spinner size={16} /></span>{/if}
            </span>
          </button>
          <button
            type="button"
            class="btn-secondary btn-mini"
            disabled={testingDelay !== null}
            aria-busy={testingDelay === 5}
            onclick={() => sendTest(5)}
          >
            <span class="test-button-content" class:loading={testingDelay === 5}>
              <span class="test-button-label">In 5 seconds</span>
              {#if testingDelay === 5}<span class="test-button-spinner"><Spinner size={16} /></span>{/if}
            </span>
          </button>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .setting-status {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-weight: 500;
  }

  .setting-status.good { color: var(--color-good); }
  .setting-status.denied { color: var(--color-warn); }

  .test-button-content {
    display: grid;
    place-items: center;
  }

  .test-button-label,
  .test-button-spinner {
    grid-area: 1 / 1;
  }

  .test-button-label {
    opacity: 1;
    transition: opacity var(--duration-instant) var(--ease-standard);
  }

  .test-button-content.loading .test-button-label {
    opacity: 0;
  }

  .test-button-spinner {
    display: grid;
    place-items: center;
  }

  .test-notification-status {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

</style>
