<script lang="ts">
  // Notification settings: master switch, push enrollment, and test sends.
  import { api } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { enableNativePush, isNativeIos } from "../../lib/native-push";
  import Switch from "../../components/Switch.svelte";
  import Spinner from "../../components/Spinner.svelte";

  let {
    notificationEnabled = $bindable(),
    pushStatus = $bindable(),
    onError,
    onSuccess,
    showHeading = true,
  }: {
    notificationEnabled: boolean;
    pushStatus: string;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    showHeading?: boolean;
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
        onError(`Turn on notifications for pinkslip in ${isNativeIos() ? "iOS Settings" : "your browser settings"}.`);
      }
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      enablingPush = false;
    }
  }

  async function sendTest(delaySeconds: number) {
    testingNotif = delaySeconds > 0 ? `Sending in ${delaySeconds}s...` : "Sending...";
    try {
      const res = await api.push.test(delaySeconds);
      testingNotif = null;
      onSuccess(`Sent to ${res.sent} device(s)`);
    } catch (e) {
      testingNotif = null;
      onError(errorMessage(e));
    }
  }
</script>

<section>
  {#if showHeading}<h2 class="section-eyebrow">Notifications</h2>{/if}
  <div class="surface-list">
    <div class="grouped-row">
      <div class="grouped-row-copy">
        <div class="row-title">Job alerts</div>
        <div class="helper-text">Master switch for personalized alerts</div>
      </div>
      <Switch
        checked={notificationEnabled}
        onCheckedChange={(value) => (notificationEnabled = value)}
        aria-label="Job alerts"
      />
    </div>

    <!-- Push toggle -->
    <div class="grouped-row">
      <div class="grouped-row-copy">
        <div class="row-title">Push notifications</div>
        <div class="helper-text">Get notified about relevant new jobs</div>
      </div>
      <div class="field-action">
        <span class="mono-value" class:good={pushStatus === "enabled"} class:quiet={pushStatus !== "enabled"}>
          {pushStatus}
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

    <!-- Poll interval -->
    <div class="grouped-row">
      <div class="row-title">Poll interval</div>
      <span class="mono-value">Every 15 min</span>
    </div>

    <!-- Test notifications -->
    <div class="grouped-row grouped-row-block">
      <div class="row-title grouped-row-heading">Test notifications</div>
      {#if testingNotif}
        <div class="alert alert-accent mono-value grouped-row-alert">
          {testingNotif}
        </div>
      {/if}
      <div class="action-grid">
        <button class="btn-secondary" disabled={!!testingNotif} onclick={() => sendTest(0)}>
          Send now
        </button>
        <button class="btn-secondary" disabled={!!testingNotif} onclick={() => sendTest(5)}>
          Send in 5s
        </button>
      </div>
    </div>
  </div>
</section>
