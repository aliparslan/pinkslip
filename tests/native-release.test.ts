import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const native = new URL("../apps/native/", import.meta.url);
const config = JSON.parse(readFileSync(new URL("app.json", native), "utf8")).expo;
const plist = readFileSync(new URL("ios/Pinkslip/Info.plist", native), "utf8");
const delegate = readFileSync(new URL("ios/Pinkslip/AppDelegate.swift", native), "utf8");

describe("committed iOS release configuration", () => {
  it("keeps scene adoption enabled across Expo prebuilds", () => {
    const plugin = config.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === "expo-build-properties");
    expect(plugin?.[1]?.ios?.enableSceneSupport).toBe(true);
  });

  it("declares the Expo scene delegate that iOS 27 requires at launch", () => {
    expect(plist).toContain("<key>UIApplicationSceneManifest</key>");
    expect(plist).toMatch(/<key>UISceneDelegateClassName<\/key>\s*<string>EXExpoAppSceneDelegate<\/string>/);
    expect(plist).toMatch(/<key>UIApplicationSupportsMultipleScenes<\/key>\s*<false\s*\/>/);
  });

  it("provides the React factory while letting the scene own its window and startup", () => {
    expect(delegate).toMatch(/class AppDelegate:\s*ExpoAppDelegate,\s*ExpoReactNativeFactoryProvider/);
    expect(delegate).toContain("reactNativeFactory = factory");
    expect(delegate).not.toContain("UIWindow(frame:");
    expect(delegate).not.toContain("factory.startReactNative(");
  });

  it("ships the configured version and keeps the existing app identity", () => {
    const project = readFileSync(new URL("ios/Pinkslip.xcodeproj/project.pbxproj", native), "utf8");
    const version = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    expect(version).toBe(config.version);
    expect([...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]))
      .toEqual([config.version, config.version]);
    expect(config.ios.bundleIdentifier).toBe("dev.alip.pinkslip");
    expect(plist).toContain("<string>pinkslip</string>");
  });
});
