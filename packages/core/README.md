# @pinkslip/core

Framework-free client and domain logic shared by the Svelte web app, the React
web app, the Worker-side TypeScript, and (from Phase 6) the Expo app. The
dependency rule is apps → data → core → shared: core never imports React DOM,
Base UI, React Native, Svelte, browser storage, or PDF execution.

Two contracts matter today:

- **Transport.** `createApiClient(config)` builds an isolated client with its
  own `fetch`, base URL, client/build headers and token callbacks. Pass a
  service-binding fetch during SSR, a secure-storage token provider on native,
  or a test double. The legacy `api`, `configureApiClient`, `resolveApiUrl` and
  `apiFetch` exports keep the default same-origin browser client working.
- **Autosave registry.** `flushActiveAutosaves()` and `registerAutosaveFlush()`
  own no DOM. A platform shell binds `visibilitychange`/`pagehide` and calls
  them; `packages/client` holds that adapter until the Svelte app is removed.

## Ownership ledger (chunk 1.4 audit)

This audit covered every module in `packages/client/src/lib` on 2026-10-09.
It records the decided owner; only the pieces 1.4 needed moved. Per the plan,
the shared layer expands only after the 1.6 native experiments validate the
boundaries.

| Module | Decision |
| --- | --- |
| `job-format`, `job-timing`, `job-description`, `career-stage-filter`, `resume-fields`, `resume-import-quality`, `pdf-to-profile`, `utils` | already core |
| `api.ts` | core; per-request transport added in 1.4 |
| `autosave-lifecycle.ts` | core registry (1.4); the client file keeps the browser page-hide binding |
| `application-autofill.ts` | injected employer-page script and payload builder; `autofillScript(payload, bridge)` is parameterized so 6.10 can pass the `react-native-webview` bridge |
| `form-reader.ts`, `form-filler.ts` | injected employer-page scripts; self-contained by contract, stay app-owned |
| `job-content.ts` | core candidate: pure description view model; move with the native renderer (6.5) |
| `resume-document.ts` | core candidate: pure Typst compiler; move after 1.6b validates native import |
| `resume-import-orchestrator.ts` | core candidate with injected extractors; resolve in 1.6b |
| `job-navigation.ts` | route-shape contract; moves with the route map in 3.1 |
| `activation.ts`, `installation-id.ts` | pure enough to move once a non-Svelte consumer exists; storage access stays an adapter |
| `theme.ts` | platform shell: preference storage plus `data-mode`; tokens already own the values |
| `viewed.ts`, `job-library-store.ts`, `feed-store.svelte.ts`, `job-read-cache.ts`, `bootstrap-cache.ts`, `session-access.ts`, `task-presentation.svelte.ts`, `feedback.svelte.ts` | replaced by Query, URL state or feature state in 1.5 and Phase 4; no parallel global store |
| `auto-apply.ts`, `application-intent.svelte.ts`, `application-browser.ts` | feature coordination and platform bridge; split from Svelte in Phase 4.13 |
| `platform.ts`, `native-auth.ts`, `native-push.ts`, `native-logo-cache.ts`, `nav-back.ts`, `haptics.ts`, `share.ts`, `resume-file-store.ts`, `pdf-extract.ts`, `pdf-import.ts`, `pdf-resume.ts`, `resume-import-ocr.ts`, `resume-document-client.ts`, `resume-document.worker.ts` | app adapters: storage, PDF/Worker/WASM, notifications, navigation and share |
| `motion.ts`, `drag-dismiss.ts`, `modal-stack.svelte.ts`, `menu-dismiss-guard.ts`, `navigation-snapshot.ts`, `header-chrome.svelte.ts` | Svelte/DOM shell behavior; replaced by the kit and shell (Phase 2–3), not ported |
| `company-sources.ts` | re-export of `shared/company-sources`; deleted at 3.4 |
| `formatting.ts` | no importers found in the frozen app; delete at 3.4 |
