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
    rootHeaderFor,
    savedScrollFor,
    scrollContainer,
    showsRootNavigation,
  } from "../../../packages/client/src/router";
  import AppSession from "../../../packages/client/src/app/AppSession.svelte";
  import RouteView from "../../../packages/client/src/app/RouteView.svelte";
  import { asPage, resolvedPage, type PageComponent } from "../../../packages/client/src/app/page-registry";
  import Feed from "../../../packages/client/src/pages/Feed.svelte";
  import TabBar from "../../../packages/client/src/components/TabBar.svelte";
  import RootHeader from "../../../packages/client/src/components/RootHeader.svelte";
  import { hapticLight } from "../../../packages/client/src/lib/haptics";
  import { registerBackHandler } from "../../../packages/client/src/lib/nav-back";

  let route = $derived($currentRoute);
  let foreground: HTMLElement | undefined = $state();
  let underlay: HTMLElement | undefined = $state();
  let dim: HTMLElement | undefined = $state();
  let main: HTMLElement | undefined = $state();
  let underlayRoute: string | null = $state(null);
  let swiping = $state(false);
  let settling = $state(false);

  function pageFor(value: string): { component: PageComponent; jobId: string | null } {
    return {
      component: resolvedPage(value) ?? asPage(Feed),
      jobId: routeParam(value, "jobId"),
    };
  }

  let UnderlayPage = $derived(underlayRoute ? pageFor(underlayRoute).component : null);
  let underlayJobId = $derived(underlayRoute ? pageFor(underlayRoute).jobId : null);
  let underlayHasTabs = $derived(underlayRoute ? routeDepth(underlayRoute) === 0 : false);
  let underlayScroll = $derived(underlayRoute ? savedScrollFor(underlayRoute) : 0);
  let underlayHeader = $derived(underlayRoute ? rootHeaderFor(underlayRoute) : null);
  let visualRoute = $derived((swiping || settling) && underlayRoute ? underlayRoute : route);
  let mobileTabBarVisible = $derived(showsRootNavigation(visualRoute));

  const EDGE = 44;
  const SETTLE = 240;
  const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
  let width = 0;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let candidate = false;
  let locked = false;
  let target: string | null = null;

  function paint(dx: number): void {
    const progress = width ? Math.min(1, Math.max(0, dx / width)) : 0;
    if (foreground) foreground.style.transform = `translateX(${dx}px)`;
    if (underlay) underlay.style.transform = `translateX(${-(1 - progress) * width * 0.3}px)`;
    if (dim) dim.style.opacity = `${(1 - progress) * 0.14}`;
  }

  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  async function commitBack(destination: string): Promise<void> {
    const targetScroll = savedScrollFor(destination);
    navigate(destination);
    const deadline = performance.now() + 1_200;
    do {
      await nextFrame();
      await tick();
      restoreScrollFor(destination);
      if (targetScroll === 0 || Math.abs((scrollContainer()?.scrollTop ?? 0) - targetScroll) < 1) return;
    } while (performance.now() < deadline);
  }

  function onTouchStart(event: TouchEvent): void {
    candidate = false;
    if (settling || swiping) return;
    target = backTargetRoute(route);
    const touch = event.touches[0];
    if (!target || !touch || touch.clientX > EDGE) return;
    width = innerWidth;
    startX = lastX = touch.clientX;
    startY = touch.clientY;
    lastTime = performance.now();
    velocity = 0;
    candidate = true;
    locked = false;
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
        return;
      }
      locked = true;
      swiping = true;
      underlayRoute = target;
      document.body.classList.add("nav-animating");
    }
    event.preventDefault();
    const now = performance.now();
    const elapsed = now - lastTime;
    if (elapsed > 0) velocity = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = now;
    paint(Math.max(0, dx));
  }

  function clearTransition(): void {
    if (foreground) {
      foreground.style.transition = "";
      foreground.style.transform = "";
    }
    underlayRoute = null;
    settling = false;
    document.body.classList.remove("nav-animating");
  }

  function onTouchEnd(): void {
    if (!candidate) return;
    candidate = false;
    if (!locked) return;
    locked = false;
    const distance = Math.max(0, lastX - startX);
    const commit = distance > width * 0.4 || velocity > 0.35;
    const destination = target;
    settling = true;
    swiping = false;
    if (foreground) foreground.style.transition = `transform ${SETTLE}ms ${EASE}`;
    if (underlay) underlay.style.transition = `transform ${SETTLE}ms ${EASE}`;
    if (dim) dim.style.transition = `opacity ${SETTLE}ms ${EASE}`;
    if (commit) {
      hapticLight();
      if (foreground) foreground.style.transform = `translateX(${width}px)`;
      if (underlay) underlay.style.transform = "translateX(0)";
      if (dim) dim.style.opacity = "0";
    } else {
      paint(0);
    }
    window.setTimeout(async () => {
      if (commit && destination) await commitBack(destination);
      clearTransition();
    }, SETTLE + 20);
  }

  async function animateBack(destination: string): Promise<void> {
    if (settling || swiping) return;
    settling = true;
    width = innerWidth;
    underlayRoute = destination;
    document.body.classList.add("nav-animating");
    await tick();
    if (foreground) { foreground.style.transition = "none"; foreground.style.transform = "translateX(0)"; }
    if (underlay) { underlay.style.transition = "none"; underlay.style.transform = `translateX(${-width * 0.3}px)`; }
    if (dim) { dim.style.transition = "none"; dim.style.opacity = "0.14"; }
    void foreground?.offsetWidth;
    requestAnimationFrame(() => {
      hapticLight();
      if (foreground) { foreground.style.transition = `transform ${SETTLE}ms ${EASE}`; foreground.style.transform = `translateX(${width}px)`; }
      if (underlay) { underlay.style.transition = `transform ${SETTLE}ms ${EASE}`; underlay.style.transform = "translateX(0)"; }
      if (dim) { dim.style.transition = `opacity ${SETTLE}ms ${EASE}`; dim.style.opacity = "0"; }
      window.setTimeout(async () => {
        await commitBack(destination);
        clearTransition();
      }, SETTLE + 20);
    });
  }

  $effect(() => {
    const element = foreground;
    if (!element) return;
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  });

  $effect(() => {
    void route;
    if (!document.body.classList.contains("nav-animating")) return;
    const page = main?.querySelector<HTMLElement>(".page");
    if (page) page.style.animation = "none";
  });

  onMount(() => registerBackHandler(() => {
    const destination = backTargetRoute(route);
    if (!destination) return false;
    void animateBack(destination);
    return true;
  }));
</script>

<AppSession>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="status-bar-scrim" aria-hidden="true"></div>

  {#if underlayRoute && UnderlayPage}
    <div class="nav-underlay" bind:this={underlay} aria-hidden="true">
      <div class="app-content-shell nav-underlay-shell">
        {#if underlayHeader}
          <div class="root-header-layer nav-underlay-header" style:--underlay-scroll={`${Math.max(0, underlayScroll)}px`}>
            <RootHeader title={underlayHeader.title} subtitle={underlayHeader.subtitle} />
          </div>
        {/if}
        <div class="nav-underlay-content" class:mobile-tabs-visible={underlayHasTabs} style:transform={`translateY(-${underlayScroll}px)`}>
          {#if underlayHeader}<div class="root-header-spacer" aria-hidden="true"></div>{/if}
          <UnderlayPage jobId={underlayJobId} routeOverride={underlayRoute} />
        </div>
      </div>
      <div class="nav-underlay-dim" bind:this={dim}></div>
    </div>
  {/if}

  <div
    class="app-content-shell nav-foreground ios-app-shell"
    class:is-swiping={swiping}
    class:mobile-tabs-visible={mobileTabBarVisible}
    class:admin-shell-active={routeShell(route) === "admin"}
    bind:this={foreground}
  >
    <main id="main-content" class="app-main" tabindex="-1" bind:this={main}>
      <RouteView />
    </main>
    {#if routeShell(route) === "consumer"}<TabBar mobileHidden={!mobileTabBarVisible} />{/if}
  </div>
</AppSession>
