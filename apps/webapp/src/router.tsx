import { createRouter } from "@tanstack/react-router";
import { DataProvider, createAppQueryClient } from "@pinkslip/data";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { RouteErrorPage } from "./features/states/PageStates";
import { createWebApiClient } from "./platform/api";
import type { RouterContext } from "./platform/router-context";

export function getRouter() {
  // Per request on the server: no cache or client is shared between requests.
  const queryClient = createAppQueryClient();
  const api = createWebApiClient();
  const context: RouterContext = { api, queryClient };

  const router = createRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultViewTransition: {
      types: ({ fromLocation, toLocation, pathChanged }): string[] | false => {
        if (!pathChanged || !fromLocation || typeof window === "undefined"
          || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
        const from = router.getMatchedRoutes(fromLocation.pathname)[2]?.options.staticData?.page;
        const to = router.getMatchedRoutes(toLocation.pathname)[2]?.options.staticData?.page;
        if (!from || !to || from.depth === to.depth) return false;
        return [to.depth > from.depth ? "deeper" : "shallower"];
      },
    },
    // Each route's own boundary, so a failing page keeps the app frame.
    defaultErrorComponent: RouteErrorPage,
    Wrap: ({ children }) => <DataProvider api={api}>{children}</DataProvider>,
  });
  // Dehydrates server-loaded query data into the page and hydrates it in the
  // browser, so hydration does not refetch. Also adds the QueryClientProvider.
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register { router: ReturnType<typeof getRouter>; }
}
