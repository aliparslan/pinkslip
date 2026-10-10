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
      // Prevent focus from undoing the router's history scroll restoration.
      document.getElementById("main")?.focus({ preventScroll: true });
    }
    previousPath.current = pathname;
  }, [pathname]);
  return null;
}
