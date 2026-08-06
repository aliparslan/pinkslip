<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";

  let { nativeIos = false }: { nativeIos?: boolean } = $props();

  let loading = $state(true);
  let loaded = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  let content = $state("");
  const savePresentation = new SavePresentation();
  let autosaveTimer: number | null = null;
  let saveAgain = false;

  async function loadCorpus() {
    loading = true;
    error = null;
    try {
      const latest = await api.corpus.get();
      content = latest.content_md ?? "";
      savePresentation.hydrate(latest.updated_at ?? null);
      loaded = true;
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
    const presentationGeneration = savePresentation.begin();
    error = null;
    try {
      const result = await api.corpus.update(content);
      savePresentation.succeed(presentationGeneration, result.updated_at ?? new Date().toISOString());
    } catch (e) {
      const message = errorMessage(e);
      error = message;
      savePresentation.fail(presentationGeneration, message);
    } finally {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        void saveCorpus();
      }
    }
  }

  function queueAutosave() {
    savePresentation.markDirty();
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void saveCorpus();
    }, 800);
  }

  function flushAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    void saveCorpus();
  }

  onMount(() => {
    void loadCorpus();
    const unregisterAutosaveFlush = registerAutosaveFlush(flushAutosave);
    return () => {
      unregisterAutosaveFlush();
      savePresentation.destroy();
    };
  });
</script>

<div class="page pushed-screen">
  <ScreenNav title="Master story" onBack={() => { if (!requestBack()) navigate("/you"); }}>
    {#snippet trailing()}
      {#if nativeIos}<SaveStatus phase={savePresentation.phase} />{/if}
    {/snippet}
  </ScreenNav>
  <div class="page-frame corpus-frame" class:native-layout={nativeIos}>
    {#if error && (!nativeIos || loaded)}
      <div class="alert alert-error alert-spaced" role="alert">{error}</div>
    {/if}

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if nativeIos && error && !loaded}
      <PageFailure
        title="Your master story didn’t load"
        message="Check your connection and try again."
        onRetry={() => void loadCorpus()}
      />
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
      {#if !nativeIos}<div class="save-state"><SaveStatus phase={savePresentation.phase} /></div>{/if}
    {/if}
  </div>
</div>

<style>
  .corpus-frame.native-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .corpus-frame.native-layout .corpus-intro {
    margin-bottom: 0;
  }

  .corpus-frame.native-layout .corpus-editor {
    padding: var(--space-4);
    font-family: var(--font-sans);
    line-height: 1.55;
  }
</style>
