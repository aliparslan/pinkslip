# pinkslip for iOS

The iOS app is a Capacitor 8.5 application with its own entrypoint and UI shell.
Its production web assets are packaged into the App Store binary; it does not
load the deployed website at runtime. Shared screens and product logic live in
`packages/client`, while native integrations live in `apps/ios`.

## Requirements

- Node.js 22 or newer (Bun is the project package manager)
- Xcode 26 or newer
- CocoaPods 1.16 or newer
- iOS 15 deployment target

Install once from the repository root:

```sh
bun install
```

## Build and synchronize

```sh
# Build only the packaged iOS web assets.
bun run build:ios

# Build, copy assets, update plugins, and run pod install.
bun run ios:sync

# Open the native workspace.
bun --filter @pinkslip/ios open
```

Always open `apps/ios/ios/App/App.xcworkspace`, not the `.xcodeproj`, because the
existing project uses CocoaPods.

For local live reload, start the Worker and iOS Vite app separately, then copy a
development-only server URL:

```sh
bun run dev
bun --filter @pinkslip/ios dev
CAP_SERVER_URL=http://localhost:5173 bun --filter @pinkslip/ios sync
```

`CAP_SERVER_URL` is intentionally absent from committed production config. A
normal `bun run ios:sync` returns to bundled assets.

## Native behavior

- `SceneDelegate` owns the window and custom `BridgeViewController` and forwards
  scene connection, URL, and universal-link events through Capacitor 8.5's
  `SceneDelegateProxy`.
- `SecureSessionPlugin` stores the native session in the iOS Keychain with
  `AfterFirstUnlockThisDeviceOnly` accessibility.
- `AppleSignInPlugin` presents Authentication Services directly.
- `ApplicationBrowserPlugin` presents job applications in
  `SFSafariViewController` and notifies the shared application-intent flow when
  the user returns.
- Official Capacitor plugins provide APNs registration, haptics, keyboard
  dismissal, native sharing, status bar styling, and deep-link events.

The Worker creates a revocable guest/account session through
`POST /api/v1/native/session`. Native requests send that token as a bearer token;
web requests continue using first-party cookies. Login, logout, and account
deletion rotate the native token automatically. If a stored token expires or is
revoked, the client clears it from Keychain and establishes a fresh guest session.

## Simulator compile

```sh
xcodebuild \
  -workspace apps/ios/ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/pinkslip-derived \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## APNs setup and device testing

The bundle identifier is `dev.alip.pinkslip`. Enable Push Notifications for that
App ID and configure these Worker values:

```toml
APNS_KEY_ID = "..."
APNS_TEAM_ID = "..."
APNS_BUNDLE_ID = "dev.alip.pinkslip"
# APNS_SANDBOX = "true" # direct debug/device builds only
```

Store the `.p8` contents as a secret:

```sh
wrangler secret put APNS_PRIVATE_KEY
```

APNs does not deliver normal remote notifications to the simulator. Build to a
physical device, enable notifications from onboarding or You → Alerts, then use
the in-app test notification action. Tapping a notification should route to the
job in both warm- and cold-launch cases.

## Release

`apps/ios/ios/release.sh` builds and copies the iOS bundle before archiving and
uploading. Xcode Cloud runs `bun run ios:sync` from the repository root in its
post-clone script. A web deployment and an App Store release are independent:

- shared/API-compatible changes can ship to both artifacts;
- web shell/PWA changes require only a web deployment;
- iOS shell, native plugin, or packaged shared-client changes require a new iOS
  build;
- breaking API changes require a new versioned endpoint and a compatibility
  window for installed iOS releases.
