# pinkslip iOS app — setup & testing

A Capacitor WebView wrapper that loads `https://pinkslip.alip.dev`, with **native
APNs push** and bearer-token auth for future WidgetKit / Share extensions.

The web UI, SSE tailoring, and client-side PDF/Typst all run unchanged inside the
WebView. Capacitor lives in `frontend/` (so Vite resolves the `@capacitor/*`
plugin JS); the native project is generated at `frontend/ios/`.

---

## Phase 0 — Apple setup (one-time, in the developer portal)

1. **App ID / bundle identifier**: `dev.alip.pinkslip` (change in
   `frontend/capacitor.config.ts` and `APNS_BUNDLE_ID` if you pick another).
   Enable the **Push Notifications** capability on the App ID.
2. **APNs Auth Key**: Keys → create a key with *Apple Push Notifications service
   (APNs)* enabled. Download the `AuthKey_XXXXXXXXXX.p8` (one-time download).
   Note the **Key ID** (10 chars) and your **Team ID** (10 chars).

An App Group is not required for the current app. Register
`group.dev.alip.pinkslip` only when the Phase 5 Widget or Share Extension is
implemented, then add it to the app and extension provisioning profiles.

### Wire the APNs key into the Worker

```sh
# Non-secret identifiers — uncomment + fill these in wrangler.toml [vars]:
#   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
# For Xcode debug / direct-device installs also set: APNS_SANDBOX = "true"
# (omit / "false" for TestFlight + App Store builds).

# The .p8 contents go in a secret (paste the whole PEM, incl. BEGIN/END lines):
wrangler secret put APNS_PRIVATE_KEY
```

Until these are set, `resolveApnsConfig()` returns null and the Worker simply
skips native push (Web Push still works).

---

## Phase 1 — Generate & run the iOS app

CocoaPods is required by Capacitor's iOS platform and isn't installed yet:

```sh
brew install cocoapods            # one-time
```

```sh
# From the repo root:
bun install
cd frontend && bun install        # installs @capacitor/* + web deps
bun run build                     # produces frontend/dist (the offline fallback)
bunx cap add ios                  # generates frontend/ios + runs pod install
```

Build & launch in the simulator (no Xcode GUI needed):

```sh
xcrun simctl list devices available        # pick a device name that EXISTS on your machine
# (Xcode 26 ships the iPhone 17 family — there is no "iPhone 16". Substitute below.)
xcodebuild -workspace frontend/ios/App/App.xcworkspace \
  -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' build

# Then boot + install + launch (path is printed by xcodebuild as TARGET_BUILD_DIR):
xcrun simctl boot 'iPhone 17'
open -a Simulator
xcrun simctl install booted "$(xcodebuild -workspace frontend/ios/App/App.xcworkspace -scheme App -showBuildSettings 2>/dev/null | awk '/ TARGET_BUILD_DIR /{print $3}')/App.app"
xcrun simctl launch booted dev.alip.pinkslip
```

**Verify:** the live app loads; you can browse Feed → Job detail → Tailor →
Profile; relaunching keeps you logged in (cookie session persists in the WebView).

> After any web change: `cd frontend && bun run ios:sync` (rebuilds + `cap sync`).

---

## Phase 2 — APNs sender (Worker) — already implemented

Unit tests cover JWT signing, payload shape, host selection, and config:

```sh
bun test tests/apns.test.ts
```

---

## Phase 3 — Push registration + end-to-end test

Push registration happens automatically on launch (`frontend/src/lib/native-push.ts`).
APNs does **not** deliver to the simulator — test on a **physical device**:

```sh
# Build to a connected device (find its id via: xcrun xctrace list devices)
xcodebuild -workspace frontend/ios/App/App.xcworkspace -scheme App \
  -configuration Debug -destination 'platform=iOS,id=<DEVICE_UDID>' \
  -allowProvisioningUpdates build
```

Then on the device: accept the notification permission prompt.

**Verify the token landed** (remote D1):

```sh
wrangler d1 execute pinkslip --remote \
  --command "SELECT id, user_id, platform, substr(endpoint,1,12) AS token_prefix FROM push_subscriptions WHERE platform='ios';"
```

**Fire a test push** — easiest from the in-app Settings "test notification"
button, or hit the API with your session cookie:

```sh
curl -X POST 'https://pinkslip.alip.dev/api/push/test' -b 'psid=<your-uuid>'
# Expect: {"sent":1,"total":1,"results":[{"platform":"ios","ok":true,...}]}
```

Confirm a banner arrives and tapping it deep-links to the right screen
(single new job → `/jobs/<id>`).

---

## Phase 4 — Bearer-token auth — already implemented

```sh
bun test tests/auth.test.ts

# Mint a token from a cookie session, then use it with no cookie:
TOKEN=$(curl -s -X POST 'https://pinkslip.alip.dev/api/auth/token' -b 'psid=<your-uuid>' | jq -r .token)
curl -s 'https://pinkslip.alip.dev/api/me' -H "Authorization: Bearer $TOKEN" | jq .user
# Expect the SAME user as the cookie session. An invalid token → 401 invalid_token.
```

---

## Phase 5 — Apple feature integrations (not yet built)

Native Xcode targets added under `frontend/ios/App/`, each reading the bearer
token from the App Group Keychain:

- **Widget (WidgetKit)** — `GET /api/jobs?sort=score&min_score=…`, deep-link on tap.
- **Share Extension** — share a careers URL → `POST /api/companies/verify` then `/api/companies`.
- **Shortcuts / App Intents** — "Show new jobs", "Tailor resume for…".

These depend on Phases 1–4 running on-device first.
