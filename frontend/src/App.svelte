<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    currentRoute,
    navigate,
    routeDepth,
    backTargetRoute,
    routeParam,
    routeShell,
    restoreScrollFor,
    savedScrollFor,
    showsRootNavigation,
  } from "./router";
  import { api, ApiError } from "./lib/api";
  import { attachMagicLinkHandler } from "./lib/native-auth";
  import { syncSessionAccess } from "./lib/session-access";
  import { loadLocalTailorKit } from "./lib/local-tailor";
  import { hapticLight } from "./lib/haptics";
  import { registerBackHandler } from "./lib/nav-back";
  import type { Component } from "svelte";
  import Feed from "./pages/Feed.svelte";
  import JobDetail from "./pages/JobDetail.svelte";
  import Profile from "./pages/Profile.svelte";
  import JobLibrary from "./pages/JobLibrary.svelte";
  import TabBar from "./components/TabBar.svelte";
  import Onboarding from "./components/Onboarding.svelte";
  import Spinner from "./components/Spinner.svelte";
  import ToastViewport from "./components/ToastViewport.svelte";
  import ApplicationReturnPrompt from "./components/ApplicationReturnPrompt.svelte";
  import { applicationIntent } from "./lib/application-intent.svelte";
  import { initNativePush } from "./lib/native-push";
  import { syncFeedPreferences } from "./lib/feed-store.svelte";

  // /you is the compact account/settings home. Its focused destinations reuse
  // the same stateful page component so autosaved edits survive navigation.
  type PageComponent = Component<{
    jobId?: string | null;
    routeOverride?: string;
  }>;
  // Tab pages declare no props; Svelte ignores the extra `jobId` the generic
  // render sites pass. One widening here keeps every page un-`any`-typed.
  const asPage = (component: Component<never> | PageComponent): PageComponent =>
    component as PageComponent;

  type PageModule = { default: Component<never> | PageComponent };
  type PageEntry =
    | { component: PageComponent; cacheKey?: never; load?: never }
    | { component?: never; cacheKey: string; load: () => Promise<PageModule> };

  const loadCompanies = () => import("./pages/Companies.svelte");
  const loadResume = () => import("./pages/ResumeProfile.svelte");
  const loadStory = () => import("./pages/Corpus.svelte");
  const loadTailor = () => import("./pages/Tailor.svelte");
  const loadAdmin = () => import("./pages/Admin.svelte");

  const routes: Record<string, PageEntry> = {
    "/": { component: asPage(Feed) },
    "/you": { component: asPage(Profile) },
    "/you/preferences": { component: asPage(Profile) },
    "/you/alerts": { component: asPage(Profile) },
    "/you/tailoring": { component: asPage(Profile) },
    "/you/account": { component: asPage(Profile) },
    "/you/feedback": { component: asPage(Profile) },
    "/you/companies": { cacheKey: "companies", load: loadCompanies },
    "/you/story": { cacheKey: "story", load: loadStory },
    "/you/resume": { cacheKey: "resume", load: loadResume },
    "/library/saved": { component: asPage(JobLibrary) },
    "/library/applied": { component: asPage(JobLibrary) },
    "/admin": { cacheKey: "admin", load: loadAdmin },
    "/admin/inbox": { cacheKey: "admin", load: loadAdmin },
    "/admin/sources": { cacheKey: "admin", load: loadAdmin },
    "/admin/runs": { cacheKey: "admin", load: loadAdmin },
  };

  const componentCache = new Map<string, PageComponent>();

  function entryFor(nextRoute: string): PageEntry {
    if (nextRoute.startsWith("/jobs/")) return { component: asPage(JobDetail) };
    if (nextRoute.startsWith("/tailor/")) return { cacheKey: "tailor", load: loadTailor };
    return routes[nextRoute] ?? routes["/"];
  }

  function resolvedPage(nextRoute: string): PageComponent | null {
    const entry = entryFor(nextRoute);
    if (entry.component) return entry.component;
    return componentCache.get(entry.cacheKey) ?? null;
  }

  let route = $derived($currentRoute);
  let isDetailPage = $derived(route.startsWith("/jobs/"));
  let isTailorPage = $derived(route.startsWith("/tailor/"));
  let CurrentPage: PageComponent | null = $state(asPage(Feed));
  let pageLoadGeneration = 0;
  let jobId = $derived(routeParam(route, "jobId"));
  let mobileTabBarVisible = $derived(showsRootNavigation(route));

  $effect(() => {
    const activeRoute = route;
    const generation = ++pageLoadGeneration;
    const entry = entryFor(activeRoute);
    if (entry.component) {
      CurrentPage = entry.component;
      return;
    }

    const cached = componentCache.get(entry.cacheKey);
    if (cached) {
      CurrentPage = cached;
      return;
    }

    CurrentPage = null;
    void entry.load().then((module) => {
      const component = asPage(module.default);
      componentCache.set(entry.cacheKey, component);
      if (generation === pageLoadGeneration) CurrentPage = component;
    }).catch(() => {
      if (generation === pageLoadGeneration) CurrentPage = asPage(Feed);
    });
  });

  // ── Interactive swipe-back ──────────────────────────────────────────────────
  // A left-edge drag translates the live page (foreground) to the right, revealing
  // the previous screen (underlay) with a parallax + dim, UIKit-style. Release past
  // the threshold (or with enough velocity) commits the navigation; otherwise it
  // springs back. Transforms are written imperatively for 60fps.
  let fgEl = $state<HTMLElement | undefined>();
  let underlayEl = $state<HTMLElement | undefined>();
  let dimEl = $state<HTMLElement | undefined>();

  let underlayRoute = $state<string | null>(null); // previous page, mounted only while swiping
  let swiping = $state(false); // finger down with the horizontal lock engaged

  function pageFor(r: string): { Comp: PageComponent; jid: string | null } {
    return {
      Comp: resolvedPage(r) ?? asPage(Feed),
      jid: routeParam(r, "jobId"),
    };
  }
  let UnderlayComp = $derived(underlayRoute ? pageFor(underlayRoute).Comp : null);
  let underlayJobId = $derived(underlayRoute ? pageFor(underlayRoute).jid : null);
  let underlayHasMobileTabs = $derived(underlayRoute ? routeDepth(underlayRoute) === 0 : false);
  let underlayScroll = $derived(underlayRoute ? savedScrollFor(underlayRoute) : 0);

  const EDGE = 44; // generous iOS-sized edge target for swipe-back
  const SETTLE = 240; // ms for the release animation
  const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";

  let width = 0;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // px/ms
  let candidate = false; // touch began at the edge on a backable page
  let locked = false; // confirmed a horizontal drag
  let settling = false; // release animation in flight
  let target: string | null = null;

  function paint(dx: number) {
    const p = width ? Math.min(1, Math.max(0, dx / width)) : 0;
    if (fgEl) fgEl.style.transform = `translateX(${dx}px)`;
    if (underlayEl) underlayEl.style.transform = `translateX(${-(1 - p) * width * 0.3}px)`;
    if (dimEl) dimEl.style.opacity = `${(1 - p) * 0.14}`;
  }

  function nextFrame() {
    return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  async function commitBackNavigation(dest: string) {
    const targetScroll = savedScrollFor(dest);
    navigate(dest);
    const deadline = performance.now() + 1_200;
    do {
      await nextFrame();
      await tick();
      restoreScrollFor(dest);
      if (targetScroll === 0 || Math.abs(window.scrollY - targetScroll) < 1) return;
    } while (performance.now() < deadline);
  }

  function onTouchStart(e: TouchEvent) {
    candidate = false;
    if (settling || swiping) return;
    target = backTargetRoute(route);
    if (!target) return;
    const t = e.touches[0];
    if (!t || t.clientX > EDGE) return;
    width = window.innerWidth;
    startX = lastX = t.clientX;
    startY = t.clientY;
    lastT = performance.now();
    velocity = 0;
    candidate = true;
    locked = false;
  }

  function onTouchMove(e: TouchEvent) {
    if (!candidate) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (!locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        candidate = false; // vertical intent — let the page scroll
        return;
      }
      locked = true;
      swiping = true;
      underlayRoute = target; // mount the previous page underneath
      document.body.classList.add("nav-animating");
    }

    e.preventDefault(); // we own this gesture now; block vertical scroll
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (t.clientX - lastX) / dt;
    lastX = t.clientX;
    lastT = now;
    paint(Math.max(0, dx));
  }

  function onTouchEnd() {
    if (!candidate) return;
    candidate = false;
    if (!locked) return;
    locked = false;

    const dx = Math.max(0, lastX - startX);
    const commit = dx > width * 0.4 || velocity > 0.35;
    const dest = target;
    settling = true;
    swiping = false;

    if (fgEl) fgEl.style.transition = `transform ${SETTLE}ms ${EASE}`;
    if (underlayEl) underlayEl.style.transition = `transform ${SETTLE}ms ${EASE}`;
    if (dimEl) dimEl.style.transition = `opacity ${SETTLE}ms ${EASE}`;

    if (commit) {
      hapticLight();
      if (fgEl) fgEl.style.transform = `translateX(${width}px)`;
      if (underlayEl) underlayEl.style.transform = "translateX(0)";
      if (dimEl) dimEl.style.opacity = "0";
    } else {
      paint(0); // spring back
    }

    window.setTimeout(async () => {
      if (commit && dest) {
        await commitBackNavigation(dest);
      }
      // …then drop the inline transforms so it sits naturally in place. When
      // committing, foreground and underlay now show the same page, so removing
      // the underlay is seamless.
      if (fgEl) {
        fgEl.style.transition = "";
        fgEl.style.transform = "";
      }
      underlayRoute = null;
      settling = false;
      document.body.classList.remove("nav-animating");
    }, SETTLE + 20);
  }

  // Non-passive touchmove so we can preventDefault the vertical scroll mid-swipe.
  $effect(() => {
    const el = fgEl;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  });

  // Programmatic back (header back buttons): play the same pop slide as a swipe.
  async function animateBack(dest: string) {
    if (settling || swiping) return;
    settling = true;
    width = window.innerWidth;
    underlayRoute = dest;
    document.body.classList.add("nav-animating");
    await tick(); // underlay mounts

    // Seed start positions without a transition…
    if (fgEl) { fgEl.style.transition = "none"; fgEl.style.transform = "translateX(0)"; }
    if (underlayEl) { underlayEl.style.transition = "none"; underlayEl.style.transform = `translateX(${-width * 0.3}px)`; }
    if (dimEl) { dimEl.style.transition = "none"; dimEl.style.opacity = "0.14"; }
    void fgEl?.offsetWidth; // force reflow so the next frame animates

    requestAnimationFrame(() => {
      hapticLight();
      if (fgEl) { fgEl.style.transition = `transform ${SETTLE}ms ${EASE}`; fgEl.style.transform = `translateX(${width}px)`; }
      if (underlayEl) { underlayEl.style.transition = `transform ${SETTLE}ms ${EASE}`; underlayEl.style.transform = "translateX(0)"; }
      if (dimEl) { dimEl.style.transition = `opacity ${SETTLE}ms ${EASE}`; dimEl.style.opacity = "0"; }
      window.setTimeout(async () => {
        await commitBackNavigation(dest);
        if (fgEl) { fgEl.style.transition = ""; fgEl.style.transform = ""; }
        underlayRoute = null;
        settling = false;
        document.body.classList.remove("nav-animating");
      }, SETTLE + 20);
    });
  }

  let showOnboarding: boolean = $state(false);
  let userName: string = $state("");
  let booting: boolean = $state(true);
  let sessionReady: boolean = $state(false);
  let bootError: string | null = $state(null);
  let showAccessGate: boolean = $state(false);
  let accessCode: string = $state("");
  let accessError: string | null = $state(null);
  let unlocking: boolean = $state(false);

  // Bumped on every bootstrap so a slow, superseded request (e.g. the initial
  // guest load resolving after a magic-link sign-in) can't clobber newer state.
  let bootGen = 0;

  async function bootstrapSession() {
    const gen = ++bootGen;
    bootError = null;
    accessError = null;
    showAccessGate = false;

    try {
      const { me: res, preferences } = await api.bootstrap.get();
      if (gen !== bootGen) return;
      syncSessionAccess(res);
      syncFeedPreferences(preferences.search_profile);
      userName = res.user?.name ?? "";
      showOnboarding = preferences.search_profile.onboarding_version < 2
        || !preferences.search_profile.onboarding_completed_at;
      sessionReady = true;
    } catch (error) {
      if (gen !== bootGen) return;
      sessionReady = false;
      if (error instanceof ApiError && error.status === 401 && error.code === "access_required") {
        showAccessGate = true;
        return;
      }
      bootError = error instanceof Error ? error.message : "Could not load pinkslip.";
    } finally {
      if (gen === bootGen) booting = false;
    }
  }

  async function handleAccessSubmit() {
    if (!accessCode.trim() || unlocking) return;
    unlocking = true;
    accessError = null;

    try {
      await api.access.unlock(accessCode.trim());
      accessCode = "";
      booting = true;
      await bootstrapSession();
    } catch (error) {
      accessError = error instanceof ApiError && error.status === 401
        ? "That code did not match."
        : error instanceof Error
          ? error.message
          : "Could not unlock pinkslip.";
      booting = false;
    } finally {
      unlocking = false;
    }
  }

  // Magic-link sign-in: exchange the token in-app (like Sign in with Apple) so
  // the WebView never navigates/reloads. Navigating to the server verify URL
  // instead would 302-reload the app, and getLaunchUrl() would replay the
  // (now-consumed) token on every mount → infinite "Starting up..." loop.
  async function completeMagicLinkSignIn(token: string) {
    try {
      await api.auth.verifyEmailToken(token);
      const resume = loadLocalTailorKit().resume;
      if (resume) {
        await api.resumeAssets.upload({
          fileName: resume.fileName,
          mimeType: resume.mimeType,
          size: resume.size,
          dataUrl: resume.dataUrl,
          extractedText: resume.textContent,
        }).catch(() => undefined);
      }
      // Re-fetch with the new authenticated cookie. This bumps bootGen, so the
      // initial guest bootstrap can't overwrite the signed-in state if it lands late.
      await bootstrapSession();
      navigate("/you/account");
    } catch {
      // Invalid/expired link — leave the current session as-is. The user can
      // request a fresh link from Account.
    }
  }

  onMount(() => {
    void initNativePush().catch((error) => {
      console.error("Push initialization failed:", error);
    });
    const detachApplicationIntent = applicationIntent.initialize();
    const detachMagicLink = attachMagicLinkHandler((token) => {
      void completeMagicLinkSignIn(token);
    });
    const detachBack = registerBackHandler(() => {
      const dest = backTargetRoute(route);
      if (!dest) return false;
      void animateBack(dest);
      return true;
    });
    bootstrapSession();
    return () => {
      detachApplicationIntent();
      detachMagicLink();
      detachBack();
    };
  });

  // Lock the page behind full-screen overlays so nothing scrolls underneath
  // (iOS WebView scrolls documentElement, so lock both html and body).
  $effect(() => {
    const lock = (sessionReady && showOnboarding) || showAccessGate;
    const value = lock ? "hidden" : "";
    document.documentElement.style.overflow = value;
    document.body.style.overflow = value;
  });
</script>

<!-- Solid status-bar backing keeps content clear of the system clock without
     WebKit's dark backdrop-filter gradient. Zero-height off-notch devices. -->
<div class="status-bar-scrim" aria-hidden="true"></div>

<!-- Underlay: the previous screen, mounted only during a back-swipe -->
{#if underlayRoute && UnderlayComp}
  <div class="nav-underlay" bind:this={underlayEl} aria-hidden="true">
    <div
      class="app-content-shell nav-underlay-content"
      class:mobile-tabs-visible={underlayHasMobileTabs}
      style:transform={`translateY(-${underlayScroll}px)`}
    >
      <UnderlayComp jobId={underlayJobId} routeOverride={underlayRoute} />
    </div>
    <div class="nav-underlay-dim" bind:this={dimEl}></div>
  </div>
{/if}

<div
  class="app-content-shell nav-foreground"
  class:is-swiping={swiping}
  class:mobile-tabs-visible={mobileTabBarVisible}
  class:admin-shell-active={routeShell(route) === "admin"}
  bind:this={fgEl}
>
  {#if sessionReady}
    {#if !showOnboarding}
      {#if !CurrentPage}
        <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
      {:else if isDetailPage}
        <CurrentPage {jobId} />
      {:else if isTailorPage}
        <CurrentPage {jobId} />
      {:else}
        <CurrentPage />
      {/if}
      {#if routeShell(route) === "consumer"}
        <TabBar mobileHidden={!mobileTabBarVisible} />
      {/if}
    {/if}
  {:else if bootError}
    <div class="boot-error-wrap">
      <div class="boot-error-card">
        <div class="h-display h-display-sm boot-error-title">Couldn’t load the app</div>
        <div class="boot-error-copy">{bootError}</div>
        <button class="btn-primary btn-accent" onclick={() => { booting = true; bootstrapSession(); }}>
          Try again
        </button>
      </div>
    </div>
  {:else}
    <div class="page-loading" aria-busy="true">
      <Spinner size={22} label={booting ? "Starting up" : "Waiting for access"} />
    </div>
  {/if}
</div>

{#if showAccessGate}
  <div class="access-gate">
    <div class="access-card">
      <h2 class="h-display h-display-lg access-title">Enter the shared code</h2>
      <p class="access-copy">
        <span class="brand-word"><span class="brand-word-pink">Pink</span>slip</span>
        keeps shared state for your group, so the app now checks a single access code before it loads.
      </p>
      <label for="access-code" class="field-label access-label">
        Access code
      </label>
      <input
        id="access-code"
        class="input-field"
        type="password"
        placeholder="Enter code"
        bind:value={accessCode}
        onkeydown={(event) => event.key === "Enter" && handleAccessSubmit()}
      />
      {#if accessError}
        <div class="alert alert-error access-alert" role="alert">
          {accessError}
        </div>
      {/if}
      <button
        class="btn-primary btn-accent full-width access-submit"
        disabled={!accessCode.trim() || unlocking}
        onclick={handleAccessSubmit}
      >
        {unlocking ? "Checking…" : "Unlock"}
      </button>
    </div>
  </div>
{/if}

{#if sessionReady && showOnboarding}
  <Onboarding onComplete={(name) => { userName = name; showOnboarding = false; }} />
{/if}

<ToastViewport />
<ApplicationReturnPrompt />
