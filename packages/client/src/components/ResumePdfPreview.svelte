<script lang="ts">
  import Spinner from "./Spinner.svelte";

  let {
    pdf,
    pageCount,
    onReady,
    onError,
  }: {
    pdf: Uint8Array;
    pageCount: number;
    onReady?: (durationMs: number) => void;
    onError?: (message: string) => void;
  } = $props();

  let pagesHost: HTMLDivElement | null = $state(null);
  let rendering = $state(true);
  let renderRevision = 0;

  async function loadPdfDocument(bytes: Uint8Array) {
    const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs?url"),
    ]);
    GlobalWorkerOptions.workerSrc = workerModule.default;
    return getDocument({ data: bytes }).promise;
  }

  async function renderPdf(
    host: HTMLDivElement,
    bytes: Uint8Array,
    expectedPages: number,
    revision: number,
  ) {
    const startedAt = performance.now();
    let pdfDocument: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
    try {
      pdfDocument = await loadPdfDocument(bytes);
      if (revision !== renderRevision) return;
      if (pdfDocument.numPages !== expectedPages) {
        throw new Error("The preview page count did not match the generated PDF.");
      }

      const fragment = window.document.createDocumentFragment();
      const scale = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.className = "resume-pdf-canvas";
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Resume preview, page ${pageNumber} of ${pdfDocument.numPages}`);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("The PDF preview canvas is unavailable.");
        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          background: "rgb(255,255,255)",
        }).promise;
        page.cleanup();
        if (revision !== renderRevision) return;
        fragment.append(canvas);
      }

      host.replaceChildren(fragment);
      rendering = false;
      onReady?.(Math.round(performance.now() - startedAt));
    } catch (cause) {
      if (revision !== renderRevision) return;
      rendering = false;
      host.replaceChildren();
      onError?.(cause instanceof Error ? cause.message : "The PDF preview could not be shown.");
    } finally {
      await pdfDocument?.destroy();
    }
  }

  $effect(() => {
    if (!pagesHost) return;
    const host = pagesHost;
    const bytes = Uint8Array.from(pdf);
    const expectedPages = pageCount;
    const revision = ++renderRevision;
    rendering = true;
    host.replaceChildren();
    void renderPdf(host, bytes, expectedPages, revision);
    return () => {
      if (renderRevision === revision) renderRevision += 1;
    };
  });
</script>

<div class="preview-frame" aria-busy={rendering}>
  {#if rendering}
    <div class="preview-loading"><Spinner size={22} label="Rendering PDF preview" /></div>
  {/if}
  <div class="preview-pages" bind:this={pagesHost}></div>
</div>

<style>
  .preview-frame,
  .preview-pages {
    width: 100%;
  }

  .preview-frame {
    position: relative;
    min-height: 45dvh;
  }

  .preview-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }

  .preview-pages {
    display: grid;
    gap: var(--space-4);
  }

  .preview-pages :global(.resume-pdf-canvas) {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-sm);
    background: var(--color-paper);
    box-shadow: var(--shadow-overlay);
  }
</style>
