# Client architecture

Pinkslip has two product surfaces with one shared product core:

```text
apps/web  ──┐
            ├── packages/client ── packages/core ── shared (@pinkslip/domain)
apps/ios  ──┘                           │                    │
                                        └── Worker API / D1 / R2
```

The dependency direction only points inward. Shared client code never imports a
web or iOS implementation. Each app installs a `PlatformRuntime` before mounting
the shared session and route layers.

## Ownership

### `apps/web`

Owns SvelteKit file routes and layouts, responsive workspace composition, static output,
service-worker/Web Push integration, manifest behavior, Web Share fallback, and
web-only release. “PWA” is an implementation detail; the product is presented as
Pinkslip on the web.

The web build uses SvelteKit 3 and `adapter-static`. Personalized routes under
`src/routes/(app)` are client-rendered behind `AppSession`. Public routes such
as `/about` are prerendered HTML. Cloudflare still serves `apps/web/dist` beside
the existing Hono Worker; this migration adds no SSR Worker or paid service.

`WebApp` retains the Feed/Library collection while a job is selected; leaf Kit
routes render the detail and settings screens. Collection page entries are
intentionally empty because their presentation belongs to the persistent shell.
`WebRouteFrame` owns headers, render recovery, titles, and route focus.
The shared navigation API delegates browser navigation to Kit through
`kit-navigation.ts`; the shared page registry and hash adapter remain native-owned.
When adding a route, add its Kit entry and shared route metadata. Domain screens
continue to live in `packages/client`.

Dialogs, settings switches, job menus, feed filter dialogs, work-mode menus,
and Library/Tailor tabs use Bits UI. Tokens and canonical CSS own appearance and
motion. Mobile sheet drag behavior remains an adaptive extension to the dialog.

### `apps/ios`

Owns the iOS entrypoint, touch navigation composition, Capacitor dependencies,
API origin, Keychain session, native plugins, native build output, and Xcode
project. Production always consumes the packaged `apps/ios/dist` bundle.

### `packages/client`

Owns reusable pages, components, typed API calls, route definitions, state,
onboarding/session gates, and design tokens. Platform-facing code calls the
small runtime contract in `src/lib/platform.ts`; it does not detect viewport
width, display mode, or Capacitor at runtime.

### `packages/core`

Owns client logic that does not depend on a UI framework or the DOM: the typed
API client, resume text parsing and import quality, career-stage filtering, job
timing, and small formatting helpers. Any app can use it, including future
non-Svelte clients, and the Worker reuses its resume parsing. Its TypeScript
project omits the DOM library, so `window` or `document` use fails `bun run
check`. UI caches follow job mutations through `onJobMutation` rather than core
importing a store.

### Worker and shared domain

`shared/` is the `@pinkslip/domain` workspace package: types and rules used by
both the Worker and clients. The Worker imports it by relative path; packages
import it by name.


The Worker remains the system boundary for authorization and data. Browser
sessions use secure first-party cookies. iOS sessions reuse revocable
`auth_sessions` IDs as bearer credentials and store them in Keychain. Extension
API tokens remain a separate authenticated-only capability.

## Where a change belongs

- A route or reusable screen belongs in `packages/client`. A domain rule or data
  shape belongs in `shared`. Client logic with no UI or DOM dependency belongs
  in `packages/core`.
- Browser navigation, install prompts, service-worker behavior, or desktop
  composition belongs in `apps/web`.
- iOS navigation, lifecycle, Keychain, APNs, system presentation, or a Capacitor
  plugin belongs in `apps/ios`.
- A platform capability used by shared UI is added to `PlatformRuntime`, then
  implemented independently by both apps.
- Do not select an app shell using viewport width, user agent, or standalone
  display mode. The build target chooses the shell.

## Build and release boundaries

```sh
bun --filter @pinkslip/web dev
bun run build:frontend
bun run build:ios
bun run ios:sync
bun run check
bun test
```

Cloudflare Assets serves only `apps/web/dist`. Capacitor copies only
`apps/ios/dist`. CI builds both, so either side can evolve without accidentally
breaking the other.

Installed iOS binaries can live longer than a web deployment. Existing API
routes therefore remain additive and backwards-compatible. Native-only contracts
start under `/api/v1/native`; a breaking contract gets a new version instead of
changing the meaning of the existing endpoint.

## Capacitor 8.5 baseline

The app targets Node 22+, Xcode 26+, and iOS 15+. It uses the UIScene lifecycle,
including scene-scoped pause/resume and navigation decisions, launch URL support,
and scene-aware URL/universal-link forwarding. The scene layer is single-window
today but is compatible with future multi-window support.

Upgrade references:

- <https://capacitorjs.com/docs/updating/8-0>
- <https://capacitorjs.com/docs/updating/8-5>
- <https://capacitorjs.com/docs/main/reference/support-policy>
