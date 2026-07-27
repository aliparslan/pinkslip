<script lang="ts">
  import { onMount } from "svelte";
  import { api, type CorpusVersion } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import Modal from "../components/Modal.svelte";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";

  let loading = $state(true);
  let saving = $state(false);
  let error: string | null = $state(null);
  let success: string | null = $state(null);
  let content = $state("");
  let currentVersionId = $state<number | null>(null);
  let selectedVersionId = $state<number | null>(null);
  let versions = $state<Array<Omit<CorpusVersion, "content_md">>>([]);
  let savedAt = $state<string | null>(null);
  let autosaveTimer: number | null = null;
  let showSnapshotModal = $state(false);
  let snapshotLabel = $state("");
  let snapshotting = $state(false);

  let isReadonly = $derived(
    selectedVersionId !== null && currentVersionId !== null && selectedVersionId !== currentVersionId
  );

  async function loadCorpus() {
    loading = true;
    error = null;
    try {
      const [latest, versionRes] = await Promise.all([
        api.corpus.get(),
        api.corpus.versions(),
      ]);
      content = latest.content_md ?? "";
      currentVersionId = latest.version_id ?? null;
      selectedVersionId = latest.version_id ?? null;
      savedAt = latest.updated_at ?? null;
      versions = versionRes.versions ?? [];
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  async function saveCorpus() {
    if (isReadonly || saving) return;
    saving = true;
    error = null;
    try {
      const res = await api.corpus.update(content);
      currentVersionId = res.version_id ?? currentVersionId;
      selectedVersionId = res.version_id ?? selectedVersionId;
      savedAt = res.updated_at ?? new Date().toISOString();
      success = "Saved";
      setTimeout(() => {
        success = null;
      }, 1600);
      const versionRes = await api.corpus.versions();
      versions = versionRes.versions ?? [];
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
    }
  }

  function queueAutosave() {
    if (autosaveTimer !== null) {
      window.clearTimeout(autosaveTimer);
    }
    autosaveTimer = window.setTimeout(() => {
      saveCorpus();
    }, 30000);
  }

  async function handleVersionChange(versionId: string) {
    const nextId = Number(versionId);
    if (Number.isNaN(nextId)) return;
    selectedVersionId = nextId;

    if (currentVersionId !== null && nextId === currentVersionId) {
      const latest = await api.corpus.get();
      content = latest.content_md ?? "";
      savedAt = latest.updated_at ?? savedAt;
      return;
    }

    try {
      const version = await api.corpus.version(nextId);
      content = version.content_md;
      savedAt = version.updated_at;
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function openSnapshotModal() {
    snapshotLabel = `snapshot ${new Date().toLocaleDateString()}`;
    showSnapshotModal = true;
  }

  async function snapshotCorpus() {
    if (snapshotting) return;
    snapshotting = true;
    try {
      await api.corpus.snapshot(snapshotLabel.trim());
      showSnapshotModal = false;
      await loadCorpus();
      success = "Snapshot saved";
      setTimeout(() => {
        success = null;
      }, 2000);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      snapshotting = false;
    }
  }

  onMount(() => {
    loadCorpus();
    return () => {
      if (autosaveTimer !== null) {
        window.clearTimeout(autosaveTimer);
      }
    };
  });
</script>

<div class="page pushed-screen">
  <ScreenNav title="Master story" onBack={() => { if (!requestBack()) navigate("/you"); }} />
  <div class="page-frame corpus-page">
    <div class="stat-row corpus-stats">
      <span>{versions.length} version{versions.length === 1 ? "" : "s"}</span>
      {#if savedAt}
        <span>saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
      {/if}
      {#if isReadonly}
        <span>read-only snapshot</span>
      {/if}
    </div>

    {#if error}
      <div class="alert alert-error alert-spaced">
        {error}
      </div>
    {/if}
    {#if success}
      <div class="alert alert-success alert-spaced">
        {success}
      </div>
    {/if}

    <div class="button-cluster corpus-toolbar">
      <select
        class="input-field corpus-version-select"
        bind:value={selectedVersionId}
        onchange={(event) => handleVersionChange((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each versions as version}
          <option value={version.id}>
            #{version.id} {version.label ? `· ${version.label}` : "· live corpus"}
          </option>
        {/each}
      </select>
      <button class="btn-secondary tall-control" onclick={openSnapshotModal}>
        Save as new version
      </button>
      {#if isReadonly && currentVersionId !== null}
        <button class="btn-secondary tall-control" onclick={() => handleVersionChange(String(currentVersionId))}>
          Back to live
        </button>
      {/if}
    </div>

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else}
      <textarea
        class="input-field corpus-textarea corpus-editor"
        bind:value={content}
        readonly={isReadonly}
        oninput={queueAutosave}
        onblur={saveCorpus}
        placeholder="Capture projects, metrics, stories, strengths, and concrete bullets you want future tailoring to pull from."
      ></textarea>
    {/if}
  </div>
</div>

{#if showSnapshotModal}
  <Modal
    title="Save as new version"
    subtitle="Snapshots are read-only copies you can come back to later."
    busy={snapshotting}
    maxWidth={340}
    onclose={() => (showSnapshotModal = false)}
  >
    <label for="snapshot-label" class="field-label">Snapshot label</label>
    <input
      id="snapshot-label"
      class="input-field"
      type="text"
      maxlength="80"
      bind:value={snapshotLabel}
      onkeydown={(e) => e.key === "Enter" && void snapshotCorpus()}
    />
    <div class="action-row modal-actions">
      <button class="btn-secondary" onclick={() => (showSnapshotModal = false)} disabled={snapshotting}>Cancel</button>
      <button class="btn-primary btn-accent flex-fill" onclick={snapshotCorpus} disabled={snapshotting || !snapshotLabel.trim()}>
        {#if snapshotting}<Spinner />{/if}
        Save snapshot
      </button>
    </div>
  </Modal>
{/if}
