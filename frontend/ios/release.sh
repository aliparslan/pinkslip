#!/usr/bin/env bash
#
# Archive, sign, and upload the pinkslip iOS app to App Store Connect / TestFlight.
#
# One-time prerequisites (in Xcode, App target → Signing & Capabilities):
#   - "Automatically manage signing" + select your Team (creates the distribution
#     certificate + provisioning profile).
#   - Add the "Push Notifications" capability.
# And generate an App Store Connect API key (Users and Access → Integrations →
# App Store Connect API), download the AuthKey_<KEYID>.p8 once.
#
# Usage:
#   ./release.sh <TEAM_ID> <ASC_KEY_ID> <ASC_ISSUER_ID> <PATH_TO_AuthKey.p8>
#
set -euo pipefail

TEAM_ID="${1:?Apple Developer Team ID (Membership page)}"
KEY_ID="${2:?App Store Connect API Key ID}"
ISSUER_ID="${3:?App Store Connect API Issuer ID}"
P8="${4:?Path to the AuthKey_<KEYID>.p8 file}"

HERE="$(cd "$(dirname "$0")" && pwd)"          # frontend/ios
FRONTEND="$(cd "$HERE/.." && pwd)"             # frontend
WS="$HERE/App/App.xcworkspace"
BUILD="$HERE/build"
ARCHIVE="$BUILD/App.xcarchive"
mkdir -p "$BUILD"

echo "==> Building web bundle + syncing native project"
( cd "$FRONTEND" && bun run build \
  && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bunx cap copy ios )

echo "==> Writing ExportOptions.plist"
cat > "$BUILD/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

echo "==> Archiving (Release)"
xcodebuild -workspace "$WS" -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$P8" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID" \
  archive

echo "==> Exporting + uploading to App Store Connect / TestFlight"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportPath "$BUILD/export" \
  -exportOptionsPlist "$BUILD/ExportOptions.plist" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$P8" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID"

echo "==> Uploaded. The build appears in App Store Connect → TestFlight after"
echo "    processing (~5-15 min). If 'app-store-connect' errors on an older"
echo "    Xcode, change method to 'app-store' in ExportOptions.plist."
