#!/bin/sh

set -e

# Xcode Cloud checks out a clean repository. The project deliberately does not
# commit node_modules, CocoaPods, or Capacitor's generated App/public and config
# files, so recreate all of them before Xcode starts the archive action.
export BUN_INSTALL="${HOME}/.bun"
export PATH="${BUN_INSTALL}/bin:${PATH}"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.com/install | bash
fi

cd "${CI_PRIMARY_REPOSITORY_PATH}/frontend"
bun install --frozen-lockfile
bun run build
bunx cap sync ios
