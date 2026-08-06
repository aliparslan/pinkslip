<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    currentRoute,
    navigate,
    routeDepth,
    backTargetRoute,
    routeShell,
    restoreScrollFor,
    scrollContainer,
    showsRootNavigation,
  } from "../../../packages/client/src/router";
  import AppSession from "../../../packages/client/src/app/AppSession.svelte";
  import RouteView from "../../../packages/client/src/app/RouteView.svelte";
  import TabBar from "../../../packages/client/src/components/TabBar.svelte";
  import {
    activeLocalBackHandler,
    registerBackHandler,
    type LocalBackHandler,
  } from "../../../packages/client/src/lib/nav-back";
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

  interface RouteSnapshot {
    html: string;
    scrollTop: number;
  }

  const routeSnapshots = new Map<string, RouteSnapshot>();

  let underlayHasTabs = $derived(Boolean(underlayRoute && showsRootNavigation(underlayRoute)));
  let visualRoute = $derived((swiping || settling) && underlayRoute ? underlayRoute : route);
  let mobileTabBarVisible = $derived(showsRootNavigation(visualRoute));

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
  const SNAPSHOT_LIMIT = 3;

  function paint(dx: number): void {
    const progress = width ? Math.min(1, Math.max(0, dx / width)) : 0;
    if (reducedMotion()) {
      if (foreground) foreground.style.opacity = `${1 - progress * 0.16}`;
      if (underlay) underlay.style.transform = "translateX(0)";
      if (dim) dim.style.opacity = "0";
      return;
    }
    if (foreground) foreground.style.transform = `translateX(${dx}px)`;
    if (underlay) underlay.style.transform = `translateX(${-(1 - progress) * width * 0.3}px)`;
    if (dim) dim.style.opacity = `${(1 - progress) * 0.14}`;
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
    const deadline = performance.now() + 1_500;
    do {
      await nextFrame();
      await tick();
      const pageRoot = main?.querySelector<HTMLElement>(".page-content-root");
      const routeRendered = pageRoot?.dataset.renderedRoute === destination;
      if (!routeRendered) continue;
      restoreScrollFor(destination);
      if (!pageRoot.querySelector(".page-loading")) {
        await nextFrame();
        restoreScrollFor(destination);
        return;
      }
    } while (performance.now() < deadline);
    restoreScrollFor(destination);
    await nextFrame();
  }

  async function commitBack(
    destination: string,
    localBack: LocalBackHandler | null,
  ): Promise<void> {
    if (localBack) {
      await localBack.commit();
      await tick();
      await nextFrame();
      return;
    }
    navigate(destination);
    await waitForDestinationPaint(destination);
  }

  async function revealLiveDestination(): Promise<void> {
    if (!foreground) return;
    foreground.style.transition = "none";
    foreground.style.transform = "translateX(0)";
    if (reducedMotion()) {
      foreground.style.opacity = "1";
      await nextFrame();
      return;
    }
    foreground.style.opacity = "0";
    void foreground.offsetWidth;
    foreground.style.transition = "opacity 80ms linear";
    await nextFrame();
    foreground.style.opacity = "1";
    await waitForAnimations([foreground], 120);
  }

  function onTouchStart(event: TouchEvent): void {
    candidate = false;
    if (settling || swiping) return;
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
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
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
    const commit = distance > width * 0.4 || velocity > 0.35;
    const destination = target;
    const snapshotKey = targetSnapshotKey;
    const localBack = targetLocalBack;
    const duration = settleDuration(distance, commit);
    settling = true;
    swiping = false;
    if (foreground) foreground.style.transition = reducedMotion()
      ? `opacity ${duration}ms linear`
      : `transform ${duration}ms ${EASE}`;
    if (underlay) underlay.style.transition = `transform ${duration}ms ${EASE}`;
    if (dim) dim.style.transition = `opacity ${duration}ms ${EASE}`;
    if (commit) {
      if (foreground) {
        if (reducedMotion()) foreground.style.opacity = "0";
        else foreground.style.transform = `translateX(${width}px)`;
      }
      if (underlay) underlay.style.transform = "translateX(0)";
      if (dim) dim.style.opacity = "0";
    } else {
      paint(0);
    }
    await waitForAnimations([foreground, underlay, dim], duration + 60);
    if (commit && destination) {
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
    settling = true;
    width = foreground?.getBoundingClientRect().width ?? innerWidth;
    const snapshotKey = localBack?.snapshotKey ?? destination;
    prepareUnderlay(destination, snapshotKey);
    document.body.classList.add("nav-animating");
    await tick();
    if (reducedMotion()) {
      await commitBack(destination, localBack);
      routeSnapshots.delete(snapshotKey);
      clearTransition();
      return;
    }
    if (foreground) { foreground.style.transition = "none"; foreground.style.transform = "translateX(0)"; }
    if (underlay) { underlay.style.transition = "none"; underlay.style.transform = `translateX(${-width * 0.3}px)`; }
    if (dim) { dim.style.transition = "none"; dim.style.opacity = "0.14"; }
    void foreground?.offsetWidth;
    await nextFrame();
    if (foreground) { foreground.style.transition = `transform ${PROGRAMMATIC_SETTLE}ms ${EASE}`; foreground.style.transform = `translateX(${width}px)`; }
    if (underlay) { underlay.style.transition = `transform ${PROGRAMMATIC_SETTLE}ms ${EASE}`; underlay.style.transform = "translateX(0)"; }
    if (dim) { dim.style.transition = `opacity ${PROGRAMMATIC_SETTLE}ms ${EASE}`; dim.style.opacity = "0"; }
    await waitForAnimations([foreground, underlay, dim], PROGRAMMATIC_SETTLE + 60);
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
    const page = main?.querySelector<HTMLElement>(".page");
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
        captureRouteSnapshot(detail.from);
      }
    };
    const captureBeforeLocalNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ snapshotKey?: string }>).detail;
      if (detail?.snapshotKey) captureRouteSnapshot(detail.snapshotKey);
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
    <div class="nav-underlay" bind:this={underlay} aria-hidden="true">
      <div
        class="app-content-shell nav-underlay-shell nav-underlay-snapshot"
        class:mobile-tabs-visible={underlayHasTabs}
      >
        {#if underlaySnapshotHtml}
          {@html underlaySnapshotHtml}
        {/if}
      </div>
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
      <RouteView />
    </main>
  </div>
  <TabBar mobileHidden={!mobileTabBarVisible} />
</AppSession>
