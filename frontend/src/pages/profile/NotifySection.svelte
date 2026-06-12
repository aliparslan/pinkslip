<script lang="ts">
  // Notification settings: master switch, push enrollment, alert threshold,
  // and test sends.
  import { api } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { enableNativePush, isNativeIos } from "../../lib/native-push";
  import Slider from "../../components/Slider.svelte";
  import Switch from "../../components/Switch.svelte";
  import Spinner from "../../components/Spinner.svelte";

  let {
    notificationEnabled = $bindable(),
    notificationThreshold = $bindable(),
    pushStatus = $bindable(),
    onError,
    onSuccess,
  }: {
    notificationEnabled: boolean;
    notificationThreshold: number;
    pushStatus: string;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
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
  <h2 class="section-eyebrow">Notifications</h2>
  <div class="surface-card" style="overflow: hidden;">
    <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px;">
      <div>
        <div style="font-size: var(--fs-md); font-weight: 600;">Job alerts</div>
        <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">Master switch for personalized alerts</div>
      </div>
      <Switch
        checked={notificationEnabled}
        onCheckedChange={(value) => (notificationEnabled = value)}
        aria-label="Job alerts"
      />
    </div>

    <div class="divider"></div>

    <!-- Push toggle -->
    <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-size: var(--fs-md); font-weight: 500;">Push notifications</div>
        <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">Get notified for high-scoring jobs</div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-family: var(--font-mono); font-size: var(--fs-2xs); color: {pushStatus === 'enabled' ? 'var(--color-good)' : 'var(--color-ink-4)'};">
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

    <div class="divider"></div>

    <!-- Threshold -->
    <div style="padding: 16px 18px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <div>
          <div style="font-size: var(--fs-md); font-weight: 500;">Alert threshold</div>
          <div style="font-size: var(--fs-2xs); color: var(--color-ink-3); margin-top: 2px;">Does not change what appears in your feed</div>
        </div>
        <span style="font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 600; color: var(--color-accent);">
          {notificationThreshold}
        </span>
      </div>
      <Slider min={0} max={100} step={5} bind:value={notificationThreshold} />
      <div style="display: flex; justify-content: space-between; margin-top: 6px; font-family: var(--font-mono); font-size: var(--fs-2xs); color: var(--color-ink-4);">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Poll interval -->
    <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;">
      <div style="font-size: var(--fs-md); font-weight: 500;">Poll interval</div>
      <span style="font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-ink-3);">Every 15 min</span>
    </div>

    <div class="divider"></div>

    <!-- Test notifications -->
    <div style="padding: 16px 18px;">
      <div style="font-size: var(--fs-md); font-weight: 500; margin-bottom: 10px;">Test notifications</div>
      {#if testingNotif}
        <div class="alert alert-accent" style="font-family: var(--font-mono); font-size: var(--fs-xs); margin-bottom: 14px;">
          {testingNotif}
        </div>
      {/if}
      <div style="display: flex; gap: 8px;">
        <button class="btn-secondary" style="flex: 1;" disabled={!!testingNotif} onclick={() => sendTest(0)}>
          Send now
        </button>
        <button class="btn-secondary" style="flex: 1;" disabled={!!testingNotif} onclick={() => sendTest(5)}>
          Send in 5s
        </button>
      </div>
    </div>
  </div>
</section>
