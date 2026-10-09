<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    currentRoute,
    navigate,
    routeDepth,
    routeDefinition,
    backTargetRoute,
    rootHeaderFor,
    rootDestinationFor,
    routeShell,
    restoreScrollFor,
    scrollContainer,
    showsRootNavigation,
    type RootDestination,
  } from "../../../packages/client/src/router";
  import AppSession from "../../../packages/client/src/app/AppSession.svelte";
  import RouteView from "../../../packages/client/src/app/RouteView.svelte";
  import TabBar from "../../../packages/client/src/components/TabBar.svelte";
  import {
    activeLocalBackHandler,
    backSwipeIntent,
    registerBackHandler,
    type LocalBackHandler,
  } from "../../../packages/client/src/lib/nav-back";
  import { hasOpenModal } from "../../../packages/client/src/lib/modal-stack.svelte";
  import { flushActiveAutosaves } from "../../../packages/client/src/lib/autosave-lifecycle";
  import { synchronizeSnapshotSearchValues } from "../../../packages/client/src/lib/navigation-snapshot";
  import {
    createFrameBatch,
    nextFrame,
    prefersReducedMotion as reducedMotion,
    waitForAnimations,
  } from "../../../packages/client/src/lib/motion";

  let route = $derived($currentRoute);
  let foreground: HTMLElement | undefined = $state();
  let underlay: HTMLElement | undefined = $state();
  let dim: HTMLElement | undefined = $state();
  let main: HTMLElement | undefined = $state();
  let underlayRoute: string | null = $state(null);
  let underlaySnapshotHtml: string | null = $state(null);
  let underlaySnapshotScroll = 0;
  let swiping = $state(false);
  let settling = $state(false);
  let tabContextRoute = $state(
    showsRootNavigation($currentRoute)
      ? $currentRoute
      : backTargetRoute($currentRoute) ?? "/",
  );

  const ROOT_DESTINATIONS: RootDestination[] = ["feed", "library", "you"];
  const DEFAULT_ROOT_ROUTES: Record<RootDestination, string> = {
    feed: "/",
    library: "/library/saved",
    you: "/you",
  };
  const RETAINED_YOU_ROUTE_IDS = new Set([
    "you",
    "you-preferences",
    "you-alerts",
    "you-tailoring",
    "you-answers",
    "you-account",
    "you-feedback",
  ]);

  function cachedRootDestinationFor(activeRoute: string): RootDestination | null {
    if (showsRootNavigation(activeRoute)) return rootDestinationFor(activeRoute);
    return RETAINED_YOU_ROUTE_IDS.has(routeDefinition(activeRoute).id) ? "you" : null;
  }

  const initialRootDestination = cachedRootDestinationFor($currentRoute);
  const initialRootRoutes = { ...DEFAULT_ROOT_ROUTES };
  if (initialRootDestination) initialRootRoutes[initialRootDestination] = $currentRoute;
  let rootRoutes = $state<Record<RootDestination, string>>(initialRootRoutes);
  let activeRootDestination = $derived(cachedRootDestinationFor(route));
  let mountedRootDestinations = $state<RootDestination[]>(
    initialRootDestination ? [initialRootDestination] : [],
  );

  interface RouteSnapshot {
    html: string;
    scrollTop: number;
  }

  const routeSnapshots = new Map<string, RouteSnapshot>();

  let underlayHasTabs = $derived(Boolean(underlayRoute && showsRootNavigation(underlayRoute)));

  $effect(() => {
    if (showsRootNavigation(route)) tabContextRoute = route;
    const destination = cachedRootDestinationFor(route);
    if (!destination) return;
    rootRoutes[destination] = route;
    if (!mountedRootDestinations.includes(destination)) {
      mountedRootDestinations = [...mountedRootDestinations, destination];
    }
  });

  async function warmRetainedRootsAfterActivePaint(cancelled: () => boolean): Promise<void> {
    // Give the active route two paint opportunities before mounting hidden
    // roots. Each additional root gets its own frame so its component and
    // initial data work cannot contend with the first useful screen.
    await nextFrame();
    await nextFrame();
    for (const destination of ROOT_DESTINATIONS) {
      if (cancelled()) return;
      if (!mountedRootDestinations.includes(destination)) {
        mountedRootDestinations = [...mountedRootDestinations, destination];
        await nextFrame();
      }
    }
  }

  $effect(() => {
    const activeScrollContainer = main;
    if (!activeScrollContainer) return;
    let cancelled = false;
    void warmRetainedRootsAfterActivePaint(() => cancelled);
    return () => {
      cancelled = true;
    };
  });

  const EDGE = 44;
  const PROGRAMMATIC_SETTLE = 280;
  const EASE = "cubic-bezier(0.2, 0, 0, 1)";
  let width = 0;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let candidate = false;
  let locked = false;
  let target: string | null = null;
  let targetSnapshotKey: string | null = null;
  let targetLocalBack: LocalBackHandler | null = null;
  const SNAPSHOT_LIMIT = 8;

  let underlayFallbackTitle = $derived.by(() => {
    if (!underlayRoute) return "";
    const rootHeader = rootHeaderFor(underlayRoute);
    if (rootHeader) return rootHeader.title;
    const fallbackTitles: Record<string, string> = {
      job: "Job details",
      tailor: "Tailor",
      "you-preferences": "Job preferences",
      "you-alerts": "Notifications",
      "you-companies": "Companies",
      "you-resume": "Resume",
      "you-tailoring": "Tailoring",
      "you-answers": "Application answers",
      "you-account": "Account",
      "you-feedback": "Help & feedback",
      "admin-overview": "Admin",
      "admin-inbox": "Inbox",
      "admin-sources": "Sources",
      "admin-runs": "Runs",
    };
    return fallbackTitles[routeDefinition(underlayRoute).id] ?? "Pinkslip";
  });

  function paint(dx: number): void {
    if (foreground) {
      if (reducedMotion()) {
        foreground.style.transform = "none";
        foreground.style.opacity = `${1 - Math.min(0.28, (dx / Math.max(1, width)) * 0.28)}`;
      } else {
        foreground.style.transform = `translateX(${dx}px)`;
      }
    }
    if (underlay) underlay.style.transform = "translateX(0)";
    if (dim) {
      const progress = Math.min(1, dx / Math.max(1, width));
      dim.style.opacity = `${1 - progress}`;
    }
  }

  const paintBatch = createFrameBatch(paint);

  function cacheSnapshot(key: string, snapshot: RouteSnapshot): void {
    routeSnapshots.delete(key);
    routeSnapshots.set(key, snapshot);
    while (routeSnapshots.size > SNAPSHOT_LIMIT) {
      const oldestKey = routeSnapshots.keys().next().value;
      if (typeof oldestKey !== "string") break;
      routeSnapshots.delete(oldestKey);
    }
  }

  function captureRouteSnapshot(key: string): void {
    if (!main) return;
    const clone = main.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    synchronizeSnapshotSearchValues(
      Array.from(main.querySelectorAll<HTMLInputElement>('input[type="search"]')),
      Array.from(clone.querySelectorAll<HTMLInputElement>('input[type="search"]')),
    );
    clone.querySelectorAll<HTMLElement>("[data-root-cache][hidden]").forEach((element) => element.remove());
    clone.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
    clone.querySelectorAll<HTMLElement>("[aria-live], [role='alert'], [role='status']").forEach((element) => {
      element.removeAttribute("aria-live");
      element.removeAttribute("role");
    });
    clone.querySelectorAll<HTMLElement>([
      "[data-nav-snapshot='exclude']",
      ".job-action-bar-wrap",
      ".modal-backdrop",
      ".sheet-backdrop",
      ".sheet",
      "[role='dialog']",
      "[data-bits-floating-content-wrapper]",
    ].join(",")).forEach((element) => element.remove());
    cacheSnapshot(key, {
      html: clone.outerHTML,
      scrollTop: scrollContainer()?.scrollTop ?? 0,
    });
  }

  function prepareUnderlay(destination: string, snapshotKey = destination): void {
    const snapshot = routeSnapshots.get(snapshotKey) ?? null;
    underlaySnapshotHtml = snapshot?.html ?? null;
    underlaySnapshotScroll = snapshot?.scrollTop ?? 0;
    underlayRoute = destination;
    void tick().then(() => {
      const snapshotMain = underlay?.querySelector<HTMLElement>(".app-main");
      snapshotMain?.scrollTo({ top: underlaySnapshotScroll, left: 0, behavior: "auto" });
    });
  }

  function discardPreparedUnderlay(): void {
    if (swiping || settling) return;
    underlayRoute = null;
    underlaySnapshotHtml = null;
    underlaySnapshotScroll = 0;
    target = null;
    targetSnapshotKey = null;
    targetLocalBack = null;
  }

  function settleDuration(distance: number, commit: boolean): number {
    if (reducedMotion()) return 1;
    const remaining = commit ? Math.max(0, width - distance) : distance;
    const speed = Math.max(Math.abs(velocity), 0.45);
    return Math.round(Math.min(280, Math.max(120, remaining / speed)));
  }

  async function waitForDestinationPaint(destination: string): Promise<void> {
    const deadline = performance.now() + 320;
    do {
      await nextFrame();
      await tick();
      const rootDestination = cachedRootDestinationFor(destination);
      const pageRoot = rootDestination
        ? main?.querySelector<HTMLElement>(
            `[data-root-cache="${rootDestination}"]:not([hidden]) .page-content-root`,
          )
        : main?.querySelector<HTMLElement>(".ios-live-route .page-content-root");
      const routeRendered = pageRoot?.dataset.renderedRoute === destination;
      if (!routeRendered) continue;
      restoreScrollFor(destination);
      await nextFrame();
      restoreScrollFor(destination);
      return;
    } while (performance.now() < deadline);
    restoreScrollFor(destination);
    await nextFrame();
  }

  async function commitBack(
    destination: string,
    localBack: LocalBackHandler | null,
  ): Promise<void> {
    if (localBack) {
      const destinationScroll = underlaySnapshotScroll;
      await localBack.commit();
      await tick();
      scrollContainer()?.scrollTo({ top: destinationScroll, left: 0, behavior: "auto" });
      await nextFrame();
      scrollContainer()?.scrollTo({ top: destinationScroll, left: 0, behavior: "auto" });
      return;
    }
    navigate(destination);
    await waitForDestinationPaint(destination);
  }

  async function revealLiveDestination(): Promise<void> {
    if (!foreground) return;
    main?.querySelector<HTMLElement>(
      ".ios-live-route .pushed-screen, [data-root-cache]:not([hidden]) .pushed-screen",
    )?.classList.add("nav-enter-suppressed");
    foreground.style.transition = "none";
    foreground.style.transform = "translateX(0)";
    foreground.style.opacity = "1";
    foreground.style.visibility = "visible";
    // Swap the live destination over its matching snapshot in the same frame.
    // Waiting before restoring visibility left one blank WKWebView frame after
    // back navigation, which read as the page disappearing and returning.
    await nextFrame();
  }

  function holdForegroundForDestinationSwap(): void {
    if (!foreground) return;
    foreground.style.transition = "none";
  }

  function onTouchStart(event: TouchEvent): void {
    candidate = false;
    if (settling || swiping || hasOpenModal()) return;
    targetLocalBack = activeLocalBackHandler();
    target = targetLocalBack ? route : backTargetRoute(route);
    targetSnapshotKey = targetLocalBack?.snapshotKey ?? target;
    const touch = event.touches[0];
    if (!target || !touch || touch.clientX > EDGE) {
      target = null;
      targetSnapshotKey = null;
      targetLocalBack = null;
      return;
    }
    width = foreground?.getBoundingClientRect().width ?? innerWidth;
    startX = lastX = touch.clientX;
    startY = touch.clientY;
    lastTime = performance.now();
    velocity = 0;
    candidate = true;
    locked = false;
    prepareUnderlay(target, targetSnapshotKey ?? target);
  }

  function onTouchMove(event: TouchEvent): void {
    if (!candidate) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (!locked) {
      const intent = backSwipeIntent(dx, dy);
      if (intent === "pending") return;
      if (intent === "other") {
        candidate = false;
        discardPreparedUnderlay();
        return;
      }
      locked = true;
      swiping = true;
      document.body.classList.add("nav-animating");
    }
    event.preventDefault();
    const now = performance.now();
    const elapsed = now - lastTime;
    if (elapsed > 0) velocity = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = now;
    paintBatch.schedule(Math.max(0, dx));
  }

  function clearTransition(): void {
    if (foreground) {
      foreground.style.transition = "";
      foreground.style.transform = "";
      foreground.style.opacity = "";
      foreground.style.visibility = "";
    }
    if (underlay) {
      underlay.style.transition = "";
      underlay.style.transform = "";
    }
    if (dim) {
      dim.style.transition = "";
      dim.style.opacity = "";
    }
    underlayRoute = null;
    underlaySnapshotHtml = null;
    underlaySnapshotScroll = 0;
    target = null;
    targetSnapshotKey = null;
    targetLocalBack = null;
    settling = false;
    document.body.classList.remove("nav-animating");
  }

  async function onTouchEnd(): Promise<void> {
    if (!candidate) return;
    candidate = false;
    if (!locked) {
      discardPreparedUnderlay();
      return;
    }
    locked = false;
    paintBatch.flush();
    const distance = Math.max(0, lastX - startX);
    const requestedCommit = distance > width * 0.4 || velocity > 0.35;
    const commit = requestedCommit ? await flushActiveAutosaves() : false;
    const destination = target;
    const snapshotKey = targetSnapshotKey;
    const localBack = targetLocalBack;
    const duration = settleDuration(distance, commit);
    settling = true;
    swiping = false;
    if (foreground) foreground.style.transition = reducedMotion()
      ? `opacity ${duration}ms linear`
      : `transform ${duration}ms ${EASE}`;
    if (dim) dim.style.transition = `opacity ${duration}ms ${EASE}`;
    if (commit) {
      if (foreground) {
        if (reducedMotion()) foreground.style.opacity = "0";
        else foreground.style.transform = `translateX(${width}px)`;
      }
      if (dim) dim.style.opacity = "0";
    } else {
      if (foreground) {
        foreground.style.transform = "translateX(0)";
        foreground.style.opacity = "1";
      }
      if (underlay) underlay.style.transform = "translateX(0)";
      if (dim) dim.style.opacity = "1";
    }
    await waitForAnimations([foreground, dim], duration + 60);
    if (commit && destination) {
      holdForegroundForDestinationSwap();
      await commitBack(destination, localBack);
      if (snapshotKey) routeSnapshots.delete(snapshotKey);
      await revealLiveDestination();
    }
    clearTransition();
  }

  function onTouchCancel(): void {
    velocity = 0;
    lastX = startX;
    void onTouchEnd();
  }

  async function animateBack(
    destination: string,
    localBack: LocalBackHandler | null = null,
  ): Promise<void> {
    if (settling || swiping) return;
    if (!(await flushActiveAutosaves())) return;
    settling = true;
    width = foreground?.getBoundingClientRect().width ?? innerWidth;
    const snapshotKey = localBack?.snapshotKey ?? destination;
    prepareUnderlay(destination, snapshotKey);
    document.body.classList.add("nav-animating");
    await tick();
    if (reducedMotion()) {
      holdForegroundForDestinationSwap();
      await commitBack(destination, localBack);
      routeSnapshots.delete(snapshotKey);
      await revealLiveDestination();
      clearTransition();
      return;
    }
    if (foreground) { foreground.style.transition = "none"; foreground.style.transform = "translateX(0)"; }
    if (underlay) { underlay.style.transition = "none"; underlay.style.transform = "translateX(0)"; }
    if (dim) { dim.style.transition = "none"; dim.style.opacity = "1"; }
    void foreground?.offsetWidth;
    await nextFrame();
    if (foreground) { foreground.style.transition = `transform ${PROGRAMMATIC_SETTLE}ms ${EASE}`; foreground.style.transform = `translateX(${width}px)`; }
    if (dim) { dim.style.transition = `opacity ${PROGRAMMATIC_SETTLE}ms ${EASE}`; dim.style.opacity = "0"; }
    await waitForAnimations([foreground, dim], PROGRAMMATIC_SETTLE + 60);
    holdForegroundForDestinationSwap();
    await commitBack(destination, localBack);
    routeSnapshots.delete(snapshotKey);
    await revealLiveDestination();
    clearTransition();
  }

  $effect(() => {
    const element = foreground;
    if (!element) return;
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchCancel);
    };
  });

  $effect(() => {
    void route;
    if (!document.body.classList.contains("nav-animating")) return;
    const page = main?.querySelector<HTMLElement>(
      ".ios-live-route .page, [data-root-cache]:not([hidden]) .page",
    );
    if (page) page.style.animation = "none";
  });

  onMount(() => {
    const captureBeforeNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ from?: string; to?: string }>).detail;
      if (
        detail?.from
        && detail.to
        && routeDepth(detail.to) > routeDepth(detail.from)
      ) {
        if (showsRootNavigation(detail.from)) tabContextRoute = detail.from;
        captureRouteSnapshot(detail.from);
      }
    };
    const captureBeforeLocalNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ snapshotKey?: string }>).detail;
      if (!detail?.snapshotKey) return;
      captureRouteSnapshot(detail.snapshotKey);
      window.requestAnimationFrame(() => {
        if (activeLocalBackHandler()?.snapshotKey !== detail.snapshotKey) return;
        scrollContainer()?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    };
    window.addEventListener("pinkslip:navigation-will-change", captureBeforeNavigation);
    window.addEventListener("pinkslip:local-navigation-will-change", captureBeforeLocalNavigation);
    const unregisterBack = registerBackHandler(() => {
      const localBack = activeLocalBackHandler();
      if (localBack) {
        void animateBack(route, localBack);
        return true;
      }
      const destination = backTargetRoute(route);
      if (!destination) return false;
      void animateBack(destination);
      return true;
    });
    return () => {
      window.removeEventListener("pinkslip:navigation-will-change", captureBeforeNavigation);
      window.removeEventListener("pinkslip:local-navigation-will-change", captureBeforeLocalNavigation);
      unregisterBack();
      paintBatch.cancel();
    };
  });
</script>

<AppSession>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="status-bar-scrim" aria-hidden="true"></div>

  {#if underlayRoute}
    <div class="nav-underlay" bind:this={underlay} aria-hidden="true" inert>
      <div
        class="app-content-shell nav-underlay-shell nav-underlay-snapshot"
        class:mobile-tabs-visible={underlayHasTabs}
      >
        {#if underlaySnapshotHtml}
          {@html underlaySnapshotHtml}
        {:else}
          <div class="nav-underlay-fallback">
            <div class="nav-underlay-fallback__header" class:root={underlayHasTabs}>
              {#if !underlayHasTabs}<span class="nav-underlay-fallback__back" aria-hidden="true">←</span>{/if}
              <strong>{underlayFallbackTitle}</strong>
            </div>
            <div class="nav-underlay-fallback__body" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
        {/if}
      </div>
      {#if underlayHasTabs}
        <TabBar mobileHidden={false} activeRouteOverride={underlayRoute ?? "/"} />
      {/if}
      <div class="nav-underlay-dim" bind:this={dim}></div>
    </div>
  {/if}

  <div
    class="app-content-shell nav-foreground ios-app-shell"
    class:is-swiping={swiping || settling}
    class:mobile-tabs-visible={showsRootNavigation(route)}
    class:admin-shell-active={routeShell(route) === "admin"}
    bind:this={foreground}
  >
    <main id="main-content" class="app-main" tabindex="-1" bind:this={main}>
      {#each mountedRootDestinations as destination}
        <div
          class="ios-root-cache"
          data-root-cache={destination}
          hidden={activeRootDestination !== destination}
          inert={activeRootDestination !== destination}
        >
          <RouteView
            routeOverride={rootRoutes[destination]}
            active={activeRootDestination === destination}
          />
        </div>
      {/each}
      {#if !activeRootDestination}
        <div class="ios-live-route"><RouteView /></div>
      {/if}
    </main>
    <TabBar
      mobileHidden={!showsRootNavigation(route)}
      activeRouteOverride={showsRootNavigation(route) ? route : tabContextRoute}
    />
  </div>
</AppSession>
