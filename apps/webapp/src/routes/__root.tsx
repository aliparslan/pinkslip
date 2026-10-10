import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Shell } from "../features/shell/Shell";
import { NavigationEffects } from "../features/navigation/NavigationEffects";
import { NotFoundPage, RouteErrorPage } from "../features/states/PageStates";
import { ToastProvider, TooltipProvider } from "../kit";
import type { RouterContext } from "../platform/router-context";
import themeCss from "@pinkslip/tokens/tokens.css?url";
import fontsCss from "@pinkslip/tokens/fonts.css?url";
import resetCss from "../styles/reset.css?url";
import baseCss from "../styles/base.css?url";
import navigationCss from "../styles/navigation.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pinkslip" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [themeCss, fontsCss, resetCss, baseCss, navigationCss].map((href) => ({ rel: "stylesheet", href })),
  }),
  component: Root,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

function Root() {
  return <html lang="en" suppressHydrationWarning>
    <head><script src="/theme.js" /><HeadContent /></head>
    <body>
      <TooltipProvider><ToastProvider><NavigationEffects /><Shell><Outlet /></Shell></ToastProvider></TooltipProvider>
      <Scripts />
    </body>
  </html>;
}
