import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Shell } from "../features/shell/Shell";
import { NavigationEffects } from "../features/navigation/NavigationEffects";
import { NotFoundPage, RouteErrorPage } from "../features/states/PageStates";
import { SessionEffects } from "../features/session/SessionEffects";
import { SessionGate } from "../features/session/SessionGate";
import { ApplicationReturnPrompt } from "../features/job-detail/ApplicationReturnPrompt";
import { PushEffects } from "../features/alerts/PushEffects";
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
      { name: "theme-color", content: "#0e0e10" },
    ],
    links: [
      ...[themeCss, fontsCss, resetCss, baseCss, navigationCss].map((href) => ({ rel: "stylesheet", href })),
      // The installable-app metadata the Svelte site shipped (apps/web/src/app.html).
      // Tab icons are the bare mark only: browsers that also saw the 192px
      // install icon (a pink tile) sometimes picked it for the tab.
      { rel: "icon", type: "image/svg+xml", sizes: "any", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "96x96", href: "/icons/favicon-96.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon-180.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  component: Root,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

function Root() {
  return <html lang="en" suppressHydrationWarning>
    <head><script src="/theme.js" /><HeadContent /></head>
    <body>
      <TooltipProvider><ToastProvider><NavigationEffects /><SessionEffects /><PushEffects /><Shell><SessionGate><Outlet /></SessionGate></Shell><ApplicationReturnPrompt /></ToastProvider></TooltipProvider>
      <Scripts />
    </body>
  </html>;
}
