# Pinkslip native prototype (1.6a)

Feasibility experiment, not a product app: the real Expo app is Phase 6.

## What it proves

- `packages/core`'s `createApiClient` works on native: a bearer guest session
  is minted against the local Worker (`POST /api/v2/native/session`), stored in
  the iOS keychain with `expo-secure-store`, and sent as `Authorization: Bearer`.
- `packages/data` hooks run under React Native: `useSession`, `useJobsList`,
  `useOwnerChangeCleanup`, and the shared QueryClient defaults.
- `packages/tokens/native` values are consumable directly.
- Metro/Hermes bundles the shared TypeScript sources with no DOM or Svelte
  dependency (a root test enforces the boundary statically).

## Run it

```sh
bun run dev:web                        # local API + webapp on :3000
bun --filter @pinkslip/native start    # Metro; press i for the iOS simulator
```

The simulator reaches the host's `127.0.0.1:3000`. A physical device needs the
dev host to bind beyond loopback and an override:
`EXPO_PUBLIC_API_URL=http://<lan-ip>:3000/api/v2 bun --filter @pinkslip/native start`.

## Record on the runtime

- [ ] First launch mints a guest session; relaunch reuses the stored token.
- [ ] "Rotate token" mints a new session; personal queries are cleared and
      `/me` plus the feed refetch with the new bearer.
- [ ] Job titles from the local D1 catalog render.
- [ ] No red screen for DOM globals (`document`/`window`) or module errors.

## Known gaps for 6.x, recorded during this experiment

- Native font families need a single family name plus bundled fonts; the
  generated values keep the web fallback list, so this prototype uses the
  system font. The native kit (6.2) owns loading and mapping.
- Real owner changes require sign-in (email magic link / Apple). This app can
  only exercise guest-session rotation until 6.3 lands.
- The app has no invite-gate handling: with `ACCESS_CODE` configured,
  `/native/session` returns `access_required` and startup shows that error.
