#!/bin/sh

set -e

# Xcode Cloud checks out a clean repository: no node_modules and no Pods.
# Install Node (Metro bundles the JS during the archive), Bun for the
# workspace install, then CocoaPods. CocoaPods needs a UTF-8 locale.
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_AUTO_UPDATE=1
brew install node cocoapods

export BUN_INSTALL="${HOME}/.bun"
export PATH="${BUN_INSTALL}/bin:${PATH}"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.com/install | bash
fi

cd "${CI_PRIMARY_REPOSITORY_PATH}"
bun install --frozen-lockfile

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
cd "${CI_PRIMARY_REPOSITORY_PATH}/apps/native/ios"
pod install
