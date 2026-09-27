import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dir, "..", path), "utf8");
}

describe("packaged iOS shell metadata", () => {
  test("uses the user-facing Pinkslip name without changing the bundle id", () => {
    const infoPlist = source("apps/ios/ios/App/App/Info.plist");
    const capacitorConfig = source("apps/ios/capacitor.config.ts");
    const html = source("apps/ios/index.html");

    expect(infoPlist).toContain("<key>CFBundleDisplayName</key>\n\t<string>Pinkslip</string>");
    expect(infoPlist).toContain("<key>CFBundleName</key>\n\t<string>Pinkslip</string>");
    expect(capacitorConfig).toContain('appId: "dev.alip.pinkslip"');
    expect(capacitorConfig).toContain('appName: "Pinkslip"');
    expect(html).toContain("<title>Pinkslip</title>");
  });

  test("declares the validated iPhone portrait device surface", () => {
    const project = source("apps/ios/ios/App/App.xcodeproj/project.pbxproj");
    const infoPlist = source("apps/ios/ios/App/App/Info.plist");

    expect(project.match(/TARGETED_DEVICE_FAMILY = 1;/g)?.length).toBe(2);
    expect(project).not.toContain('TARGETED_DEVICE_FAMILY = "1,2"');
    expect(infoPlist).toContain(
      "<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>",
    );
    expect(infoPlist).not.toContain("UISupportedInterfaceOrientations~ipad");
    expect(infoPlist).not.toContain("UIInterfaceOrientationLandscape");
  });

  test("does not package web-install metadata or the shared PWA public directory", () => {
    const html = source("apps/ios/index.html");
    const viteConfig = source("apps/ios/vite.config.ts");

    expect(html).not.toMatch(/rel="(?:icon|apple-touch-icon|manifest)"/);
    expect(viteConfig).toContain("publicDir: false");
  });

  test("mounts a branded bootstrap before native platform initialization", () => {
    const main = source("apps/ios/src/main.ts");
    const bootstrap = source("apps/ios/src/IosBootstrap.svelte");

    expect(main).toContain("mountApp(IosBootstrap)");
    expect(main).not.toContain("initializeIosPlatform");
    expect(bootstrap).toContain('<BrandLoading label="Starting Pinkslip" />');
    expect(bootstrap).toContain("void initializeIosPlatform()");
    expect(bootstrap).toContain("<svelte:boundary");
  });

  test("mounts the active root first, then warms retained roots after paint", () => {
    const shell = source("apps/ios/src/IosApp.svelte");
    const session = source("packages/client/src/app/AppSession.svelte");

    expect(shell).toContain('const ROOT_DESTINATIONS: RootDestination[] = ["feed", "library", "you"]');
    expect(shell).toContain("initialRootDestination ? [initialRootDestination] : []");
    expect(shell).toContain("warmRetainedRootsAfterActivePaint");
    expect(shell).toContain("await nextFrame();\n    await nextFrame();");
    expect(shell).toContain("{#each mountedRootDestinations as destination}");
    expect(shell).not.toContain("rootPagesReady");
    expect(shell).not.toContain("ios-root-preload");
    expect(session).toContain("NATIVE_STARTUP_SHELL_CAP_MS = 650");
    expect(session).toContain("readBootstrapCache()");
    expect(session).toContain('<BrandLoading label="Starting Pinkslip" />');
  });

  test("uses the router as the retained-route scroll restoration owner", () => {
    const shell = source("apps/ios/src/IosApp.svelte");
    const iosCss = source("packages/client/src/styles/ios.css");
    const router = source("packages/client/src/router.ts");
    const routeView = source("packages/client/src/app/RouteView.svelte");
    const rootHeader = source("packages/client/src/components/RootHeader.svelte");

    expect(shell).not.toContain("resetActiveRootScroll");
    expect(shell).not.toContain("rootScrollRestoreGeneration");
    expect(shell).toContain("active={activeRootDestination === destination}");
    expect(router).toContain("const nextScroll = returning ? savedScrollFor(nextPath) : 0");
    expect(router).toContain("window.requestAnimationFrame(() => setDocumentScroll(nextScroll))");
    expect(iosCss).toContain("html.native-ios .nav-foreground > .app-main");
    expect(iosCss).toContain("overflow-anchor: none");
    expect(router).not.toContain("switchingRootScreens");
    expect(routeView).toContain("{active}");
    expect(rootHeader).toContain("if (!active) return");
    expect(rootHeader).not.toContain("void active;\n    compact = false;");
    expect(rootHeader).toContain("if (!active || !scroller || !headerElement) return");
  });

  test("retained roots receive activation and keep header registrations by owner", () => {
    const routeView = source("packages/client/src/app/RouteView.svelte");
    const feed = source("packages/client/src/pages/Feed.svelte");
    const library = source("packages/client/src/pages/JobLibrary.svelte");
    const profile = source("packages/client/src/pages/Profile.svelte");
    const headerChrome = source("packages/client/src/lib/header-chrome.svelte.ts");
    const headerSearch = source("packages/client/src/components/HeaderSearch.svelte");

    expect(routeView).toContain("<CurrentPage {jobId} routeOverride={routeOverride} {nativeIos} {active} />");
    expect(routeView).toContain("<svelte:boundary");
    expect(feed).toContain("if (activation.becameActive(active)) void refreshIfStale()");
    expect(library).toContain("if (activation.becameActive(active)) void loadJobs(true)");
    expect(profile).toContain("if (activation.becameActive(active)) void loadSettings(true)");
    expect(headerChrome).toContain("searchFor(ownerId: string | undefined)");
    expect(headerChrome).toContain("candidate.id !== registration.id");
    expect(headerSearch).toContain("headerChrome.searchFor(ownerId)");
  });

  test("back-navigation snapshots keep live search and collapsed-header presentation", () => {
    const shell = source("apps/ios/src/IosApp.svelte");
    const rootHeader = source("packages/client/src/components/RootHeader.svelte");

    expect(shell).toContain("synchronizeSnapshotSearchValues(");
    expect(shell).toContain("main.querySelectorAll<HTMLInputElement>('input[type=\"search\"]')");
    expect(rootHeader).toContain("if (!active) return;");
    expect(rootHeader).not.toContain("void active;\n    compact = false;");
  });

  test("native accessibility preferences reach JavaScript transitions", () => {
    const platform = source("apps/ios/src/platform.ts");
    const motion = source("packages/client/src/lib/motion.ts");
    const modal = source("packages/client/src/components/Modal.svelte");
    const feed = source("packages/client/src/pages/Feed.svelte");

    expect(platform).toContain("root.dataset.iosReducedMotion = String(preferences.reducedMotion)");
    expect(motion).toContain('dataset.iosReducedMotion === "true"');
    expect(modal).toContain("motionDuration(220)");
    expect(modal).toContain("motionDistance(12)");
    expect(feed).toContain("restoreScrollDelay={motionDuration(260)}");
    expect(feed).toContain("animate:flip={{ duration: motionDuration(240)");
  });
});
