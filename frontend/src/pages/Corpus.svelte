<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";

  let loading = $state(true);
  let saving = $state(false);
  let error: string | null = $state(null);
  let content = $state("");
  let savedAt = $state<string | null>(null);
  let autosaveTimer: number | null = null;
  let saveAgain = false;

  async function loadCorpus() {
    loading = true;
    error = null;
    try {
      const latest = await api.corpus.get();
      content = latest.content_md ?? "";
      savedAt = latest.updated_at ?? null;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  async function saveCorpus() {
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    error = null;
    try {
      const result = await api.corpus.update(content);
      savedAt = result.updated_at ?? new Date().toISOString();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        void saveCorpus();
      }
    }
  }

  function queueAutosave() {
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void saveCorpus();
    }, 2000);
  }

  function flushAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    void saveCorpus();
  }

  onMount(() => {
    void loadCorpus();
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushAutosave();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushAutosave);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushAutosave);
      flushAutosave();
    };
  });
</script>

<div class="page pushed-screen">
  <ScreenNav title="Master story" onBack={() => { if (!requestBack()) navigate("/you"); }} />
  <div class="page-frame">
    {#if error}
      <div class="alert alert-error alert-spaced" role="alert">{error}</div>
    {/if}

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else}
      <p id="master-story-help" class="body-copy corpus-intro">
        Keep the projects, outcomes, strengths, and stories you want tailoring to draw from.
      </p>
      <textarea
        class="input-field corpus-textarea corpus-editor"
        bind:value={content}
        oninput={queueAutosave}
        onblur={() => void saveCorpus()}
        aria-describedby="master-story-help"
        aria-label="Master story"
        placeholder="Add projects, metrics, stories, strengths, and concrete examples…"
      ></textarea>
      <div class="save-state" role="status" aria-live="polite">
        {#if saving}
          Saving…
        {:else if savedAt}
          Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        {/if}
      </div>
    {/if}
  </div>
</div>
