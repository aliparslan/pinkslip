<script lang="ts">
  import { onMount, tick } from "svelte";
  import { currentRoute, navigate, routeDepth, backTargetRoute } from "./router";
  import { themeMode, cycleTheme } from "./lib/theme";
  import { searchOpen } from "./lib/feed-state";
  import { api, ApiError } from "./lib/api";
  import { attachMagicLinkHandler } from "./lib/native-auth";
  import { syncSessionAccess } from "./lib/session-access";
  import { hapticLight } from "./lib/haptics";
  import { registerBackHandler } from "./lib/nav-back";
  import Sun from "phosphor-svelte/lib/Sun";
  import Moon from "phosphor-svelte/lib/Moon";
  import CircleHalf from "phosphor-svelte/lib/CircleHalf";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import type { Component } from "svelte";
  import Feed from "./pages/Feed.svelte";
  import JobDetail from "./pages/JobDetail.svelte";
  import Tracker from "./pages/Tracker.svelte";
  import Companies from "./pages/Companies.svelte";
  import Events from "./pages/Events.svelte";
  import Profile from "./pages/Profile.svelte";
  import ResumeProfile from "./pages/ResumeProfile.svelte";
  import Corpus from "./pages/Corpus.svelte";
  import Tailor from "./pages/Tailor.svelte";
  import TabBar from "./components/TabBar.svelte";
  import Onboarding from "./components/Onboarding.svelte";
  import Spinner from "./components/Spinner.svelte";

  // Page components match their route names: /profile renders Profile (the
  // tab with account + settings sections), /resume the structured resume
  // editor, /corpus the versioned master-story editor.
  type PageComponent = Component<{ jobId?: string | null }>;
  // Tab pages declare no props; Svelte ignores the extra `jobId` the generic
  // render sites pass. One widening here keeps every page un-`any`-typed.
  const asPage = (component: Component<never> | PageComponent): PageComponent =>
    component as PageComponent;

  const routes: Record<string, PageComponent> = {
    "/": asPage(Feed),
    "/tracker": asPage(Tracker),
    "/events": asPage(Events),
    "/profile": asPage(Profile),
    "/companies": asPage(Companies),
    "/corpus": asPage(Corpus),
    "/resume": asPage(ResumeProfile),
    "/settings": asPage(Profile),
  };

  let route = $derived($currentRoute);
  let isDetailPage = $derived(route.startsWith("/jobs/"));
  let isTailorPage = $derived(route.startsWith("/tailor/"));
  let CurrentPage = $derived(
    isDetailPage ? JobDetail : isTailorPage ? Tailor : (routes[route] ?? Feed)
  );
  let jobId = $derived(
    isDetailPage
      ? route.split("/jobs/")[1]
      : isTailorPage
        ? route.split("/tailor/")[1]
        : null
  );
  let showTabBar = $derived(!isDetailPage && !isTailorPage);
  let mode = $derived($themeMode);
  let isOnFeed = $derived(route === "/");

  function toggleSearch() {
    if (!isOnFeed) navigate("/");
    searchOpen.update((v) => !v);
  }

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
    if (r.startsWith("/jobs/")) return { Comp: JobDetail, jid: r.split("/jobs/")[1] };
    if (r.startsWith("/tailor/")) return { Comp: Tailor, jid: r.split("/tailor/")[1] };
    return { Comp: routes[r] ?? Feed, jid: null };
  }
  let UnderlayComp = $derived(underlayRoute ? pageFor(underlayRoute).Comp : null);
  let underlayJobId = $derived(underlayRoute ? pageFor(underlayRoute).jid : null);
  let underlayHasShellHeader = $derived(underlayRoute ? routeDepth(underlayRoute) === 0 : false);

  const EDGE = 28; // px from the left edge a swipe must start within
  const SETTLE = 280; // ms for the release animation
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

  function onTouchStart(e: TouchEvent) {
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
        navigate(dest); // foreground re-renders as the destination page…
        await tick();
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
        navigate(dest);
        await tick();
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

  // Hide the app chrome behind full-screen overlays (onboarding / access gate) so
  // nothing renders — or scrolls — behind them.
  let showShellHeader = $derived(
    !isDetailPage && !isTailorPage && !showOnboarding && !showAccessGate
  );

  // Bumped on every bootstrap so a slow, superseded request (e.g. the initial
  // guest load resolving after a magic-link sign-in) can't clobber newer state.
  let bootGen = 0;

  async function bootstrapSession() {
    const gen = ++bootGen;
    bootError = null;
    accessError = null;
    showAccessGate = false;

    try {
      const [res, preferences] = await Promise.all([
        api.me.get(),
        api.preferences.get(),
      ]);
      if (gen !== bootGen) return;
      syncSessionAccess(res);
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
      // Re-fetch with the new authenticated cookie. This bumps bootGen, so the
      // initial guest bootstrap can't overwrite the signed-in state if it lands late.
      await bootstrapSession();
      navigate("/settings");
    } catch {
      // Invalid/expired link — leave the current session as-is. The user can
      // request a fresh link from Settings.
    }
  }

  onMount(() => {
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

<!-- Always-on blurred strip over the status bar / Dynamic Island so scrolled
     content never collides with the system clock. Zero-height off-notch devices. -->
<div class="status-bar-scrim" aria-hidden="true"></div>

{#snippet shellHeader()}
  <!-- Top bar -->
  <header class="app-shell-header">
    <div class="app-shell-header-inner">
      <button class="brand-home-button" aria-label="Go to feed" onclick={() => navigate("/")}>
        <!-- pinkslip icon -->
        <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true" style="transform: rotate(-8deg); flex-shrink: 0;">
          <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
          <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
          <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
          <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
        </svg>
        <span class="h-display h-display-sm" style="line-height: 1;">
          <span style="color: var(--color-accent);">pink</span>slip
        </span>
      </button>
      <div style="display: flex; align-items: center; gap: 2px;">
        <button class="icon-btn" onclick={toggleSearch} aria-label="Search jobs">
          <MagnifyingGlass size={18} weight="regular" />
        </button>
        <button class="icon-btn" onclick={cycleTheme} aria-label="Toggle theme">
          {#if mode === "system"}
            <Sun size={18} weight="regular" />
          {:else if mode === "light"}
            <Moon size={18} weight="regular" />
          {:else}
            <CircleHalf size={18} weight="regular" />
          {/if}
        </button>
      </div>
    </div>
  </header>
{/snippet}

<!-- Underlay: the previous screen, mounted only during a back-swipe -->
{#if underlayRoute && UnderlayComp}
  <div class="nav-underlay" bind:this={underlayEl} style="transform: translateX(-30%);" aria-hidden="true">
    {#if underlayHasShellHeader}
      {@render shellHeader()}
    {/if}
    <div class="app-container min-h-screen pb-28">
      <UnderlayComp jobId={underlayJobId} />
    </div>
    <div class="nav-underlay-dim" bind:this={dimEl} style="opacity: 0.14;"></div>
  </div>
{/if}

{#if showShellHeader}
  {@render shellHeader()}
{/if}

<div class="app-container min-h-screen pb-28 nav-foreground" class:is-swiping={swiping} bind:this={fgEl}>
  {#if sessionReady}
    {#if !showOnboarding}
      {#if isDetailPage}
        <CurrentPage {jobId} />
      {:else if isTailorPage}
        <CurrentPage {jobId} />
      {:else}
        <CurrentPage />
      {/if}
      {#if showTabBar}
        <TabBar />
      {/if}
    {/if}
  {:else if bootError}
    <div style="padding: 32px 22px 28px;">
      <div style="padding: 18px; border-radius: var(--radius-lg); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad);">
        <div class="h-display h-display-sm" style="margin-bottom: 6px;">Couldn’t load the app</div>
        <div style="font-size: 14px; margin-bottom: 14px;">{bootError}</div>
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
  <div style="position: fixed; inset: 0; z-index: 40; background: color-mix(in oklch, var(--color-bg) 92%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; padding: 24px;">
    <div style="width: min(100%, 360px); padding: 24px; border-radius: var(--radius-lg); background: var(--color-bg-elev); border: 1px solid var(--color-line); box-shadow: 0 18px 50px rgba(0,0,0,0.16);">
      <h2 class="h-display h-display-lg" style="margin-bottom: 8px;">Enter the shared code</h2>
      <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 18px;">
        <span class="brand-word"><span class="brand-word-pink">Pink</span>slip</span>
        keeps shared state for your group, so the app now checks a single access code before it loads.
      </p>
      <label for="access-code" class="field-label" style="margin-bottom: 8px;">
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
        <div class="alert alert-error" style="margin-top: 12px;">
          {accessError}
        </div>
      {/if}
      <button
        class="btn-primary btn-accent"
        style="width: 100%; margin-top: 16px;"
        disabled={!accessCode.trim() || unlocking}
        onclick={handleAccessSubmit}
      >
        {unlocking ? "Checking..." : "Unlock"}
      </button>
    </div>
  </div>
{/if}

{#if sessionReady && showOnboarding}
  <Onboarding onComplete={(name) => { userName = name; showOnboarding = false; }} />
{/if}
