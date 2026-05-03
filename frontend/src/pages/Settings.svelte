<script lang="ts">
  import { api } from "../lib/api";

  let loading: boolean = $state(true);
  let saving: boolean = $state(false);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);

  // Form fields
  let locations: string = $state("");
  let roleKeywords: string = $state("");
  let minYoe: number = $state(0);
  let maxYoe: number = $state(10);
  let notificationThreshold: number = $state(70);
  let pushStatus: string = $state("disabled");

  $effect(() => {
    loading = true;
    api.preferences
      .get()
      .then((prefs) => {
        locations = (prefs.locations ?? []).join(", ");
        roleKeywords = (prefs.role_keywords ?? []).join(", ");
        minYoe = prefs.min_yoe ?? 0;
        maxYoe = prefs.max_yoe ?? 10;
        notificationThreshold = prefs.notification_threshold ?? 70;
        pushStatus = prefs.push_enabled ? "enabled" : "disabled";
      })
      .catch((e) => {
        error = e.message;
      })
      .finally(() => {
        loading = false;
      });
  });

  function parseList(str: string): string[] {
    return str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleSave() {
    saving = true;
    error = null;
    successMsg = null;
    try {
      await api.preferences.update({
        locations: parseList(locations),
        role_keywords: parseList(roleKeywords),
        min_yoe: minYoe,
        max_yoe: maxYoe,
        notification_threshold: notificationThreshold,
      });
      successMsg = "Preferences saved!";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col min-h-screen">
  <!-- Header -->
  <header class="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3">
    <h1 class="text-xl font-bold">Settings</h1>
  </header>

  <main class="flex-1 px-4 py-4">
    {#if loading}
      <div class="flex justify-center items-center py-20">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else}
      <div class="flex flex-col gap-6">
        {#if error}
          <div class="alert alert-error">
            <span>{error}</span>
          </div>
        {/if}
        {#if successMsg}
          <div class="alert alert-success">
            <span>{successMsg}</span>
          </div>
        {/if}

        <!-- Locations -->
        <div class="form-control gap-1">
          <label class="label" for="locations">
            <span class="label-text font-medium">Locations</span>
          </label>
          <input
            id="locations"
            type="text"
            class="input input-bordered input-sm"
            placeholder="Remote, NYC, SF"
            bind:value={locations}
          />
          <span class="label-text-alt text-base-content/50">Comma-separated</span>
        </div>

        <!-- Role Keywords -->
        <div class="form-control gap-1">
          <label class="label" for="role-keywords">
            <span class="label-text font-medium">Role Keywords</span>
          </label>
          <input
            id="role-keywords"
            type="text"
            class="input input-bordered input-sm"
            placeholder="Software Engineer, SWE, Fullstack"
            bind:value={roleKeywords}
          />
          <span class="label-text-alt text-base-content/50">Comma-separated</span>
        </div>

        <!-- YOE Range -->
        <div class="grid grid-cols-2 gap-3">
          <div class="form-control gap-1">
            <label class="label" for="min-yoe">
              <span class="label-text font-medium">Min YOE</span>
            </label>
            <input
              id="min-yoe"
              type="number"
              class="input input-bordered input-sm"
              min="0"
              max="20"
              bind:value={minYoe}
            />
          </div>
          <div class="form-control gap-1">
            <label class="label" for="max-yoe">
              <span class="label-text font-medium">Max YOE</span>
            </label>
            <input
              id="max-yoe"
              type="number"
              class="input input-bordered input-sm"
              min="0"
              max="20"
              bind:value={maxYoe}
            />
          </div>
        </div>

        <!-- Notification Threshold -->
        <div class="form-control gap-1">
          <label class="label" for="notif-threshold">
            <span class="label-text font-medium">Notification Threshold</span>
            <span class="label-text-alt font-mono text-primary">{notificationThreshold}</span>
          </label>
          <input
            id="notif-threshold"
            type="range"
            class="range range-primary range-sm"
            min="0"
            max="100"
            step="5"
            bind:value={notificationThreshold}
          />
          <div class="flex justify-between text-xs text-base-content/40 px-1">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        <!-- Poll Interval (display only) -->
        <div class="form-control gap-1">
          <label class="label" for="poll-interval">
            <span class="label-text font-medium">Poll Interval</span>
          </label>
          <div id="poll-interval" class="input input-bordered input-sm flex items-center text-base-content/50 cursor-not-allowed bg-base-200">
            Every 15 minutes
          </div>
        </div>

        <!-- Push Notifications -->
        <div class="card bg-base-200">
          <div class="card-body py-3 px-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-sm">Push Notifications</p>
                <p class="text-xs text-base-content/50 mt-0.5">Get notified for high-scoring jobs</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge badge-sm {pushStatus === 'enabled' ? 'badge-success' : 'badge-neutral'}">
                  {pushStatus}
                </span>
                {#if pushStatus !== "enabled"}
                  <button class="btn btn-xs btn-outline" disabled>
                    Enable
                  </button>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <button
          class="btn btn-primary"
          onclick={handleSave}
          disabled={saving}
        >
          {#if saving}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          Save Preferences
        </button>
      </div>
    {/if}
  </main>
</div>
