<script lang="ts">
  import { api } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { enableNativePush } from "../../lib/native-push";
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
    pushStatus: string;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    showHeading?: boolean;
    nativeIos?: boolean;
  } = $props();

  let enablingPush: boolean = $state(false);
  let testingNotif: string | null = $state(null);

  async function handleEnablePush() {
    enablingPush = true;
    try {
      const ok = (await enableNativePush()) === "enabled";
      pushStatus = ok ? "enabled" : "disabled";
      if (ok) notificationEnabled = true;
      if (!ok) {
        onError(`Turn on notifications for pinkslip in ${nativeIos ? "iOS Settings" : "your browser settings"}.`);
      }
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      enablingPush = false;
    }
  }

  async function sendTest(delaySeconds: number) {
    testingNotif = delaySeconds > 0 ? `Sending in ${delaySeconds} seconds…` : "Sending…";
    try {
      const res = await api.push.test(delaySeconds);
      testingNotif = null;
      onSuccess(res.sent > 0 ? "Test notification sent." : "No registered device received the test.");
    } catch (e) {
      testingNotif = null;
      onError(errorMessage(e));
    }
  }
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
        tone="accent"
      />
    </div>

    <div class="grouped-row">
      <div class="grouped-row-copy">
        <div class="row-title">Push notifications</div>
        {#if !nativeIos}<div class="helper-text">Get notified about relevant new jobs</div>{/if}
      </div>
      <div class="field-action">
        <span class="setting-status" class:good={pushStatus === "enabled"}>
          {pushStatus === "enabled" ? nativeIos ? "Allowed" : "On" : "Off"}
        </span>
        {#if pushStatus !== "enabled"}
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

    {#if pushStatus === "enabled"}
      <div class="grouped-row test-notification-row">
        <div class="grouped-row-copy">
          <div class="row-title">{nativeIos ? "Send a test" : "Test notification"}</div>
          {#if testingNotif || !nativeIos}
            <div class="helper-text" role="status" aria-live="polite">
              {testingNotif ?? "Make sure alerts reach this device"}
            </div>
          {/if}
        </div>
        <div class="button-cluster test-notification-actions">
          <button type="button" class="btn-secondary btn-mini" disabled={!!testingNotif} onclick={() => sendTest(0)}>
            Send now
          </button>
          <button type="button" class="btn-secondary btn-mini" disabled={!!testingNotif} onclick={() => sendTest(5)}>
            In 5 seconds
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

  .test-notification-actions {
    flex: none;
    flex-wrap: nowrap;
    gap: var(--space-1);
  }

  .test-notification-actions :global(.btn-mini) {
    padding-inline: var(--space-2);
    font-size: var(--fs-xs);
  }
</style>
