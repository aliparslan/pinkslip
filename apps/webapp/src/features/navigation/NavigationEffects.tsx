import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { legacyHashTarget } from "./compatibility";

/** Browser-only URL migration and focus policy, shared by every route. */
export function NavigationEffects() {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  const previousPath = useRef(pathname);

  useEffect(() => {
    const migrate = () => {
      const target = legacyHashTarget(window.location.hash, window.location.search);
      if (target) void router.navigate({ href: target, replace: true, viewTransition: false });
    };
    migrate();
    window.addEventListener("hashchange", migrate);
    return () => window.removeEventListener("hashchange", migrate);
  }, [router]);

  useEffect(() => {
    if (previousPath.current && pathname !== previousPath.current) {
      // The open job's pane when it sits beside its list, else the page.
      // Prevent focus from undoing the router's history scroll restoration.
      const target = document.querySelector<HTMLElement>("[data-route-focus]") ?? document.getElementById("main");
      target?.focus({ preventScroll: true });
    }
    previousPath.current = pathname;
  }, [pathname]);
  return null;
}
