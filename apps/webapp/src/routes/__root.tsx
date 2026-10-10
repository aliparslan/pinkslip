import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { Shell } from "../features/shell/Shell";
import { ToastProvider } from "../kit";
import type { RouterContext } from "../platform/router-context";
import themeCss from "@pinkslip/tokens/tokens.css?url";
import fontsCss from "@pinkslip/tokens/fonts.css?url";
import resetCss from "../styles/reset.css?url";
import baseCss from "../styles/base.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pinkslip" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [themeCss, fontsCss, resetCss, baseCss].map((href) => ({ rel: "stylesheet", href })),
  }),
  component: Root,
  notFoundComponent: () => <section><h1>Page not found</h1><Link to="/">Back to Jobs</Link></section>,
  errorComponent: () => <section role="alert"><h1>Something went wrong</h1><p>Reload the page to try again.</p><a href="/">Back to Jobs</a></section>,
});

function Root() {
  return <html lang="en" suppressHydrationWarning>
    <head><script src="/theme.js" /><HeadContent /></head>
    <body>
      <ToastProvider><Shell><Outlet /></Shell></ToastProvider>
      <Scripts />
    </body>
  </html>;
}
