#!/bin/sh

set -e

# Xcode Cloud checks out a clean repository with no node_modules and no Pods.
# The Podfile and the bundle step both run Node, so install Node, Bun, and
# CocoaPods, then the packages and pods, before Xcode starts the archive.
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
command -v node >/dev/null 2>&1 || brew install node
command -v pod >/dev/null 2>&1 || brew install cocoapods

export BUN_INSTALL="${HOME}/.bun"
export PATH="${BUN_INSTALL}/bin:${PATH}"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.com/install | bash
fi

cd "${CI_PRIMARY_REPOSITORY_PATH}"
bun install --frozen-lockfile

cd apps/mobile/ios
# Xcode's script phases don't inherit this shell's PATH.
echo "export NODE_BINARY=$(command -v node)" > .xcode.env.local
pod install
