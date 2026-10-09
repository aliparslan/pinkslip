import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import styles from "../styles/Shell.module.css";
import themeCss from "@pinkslip/tokens/tokens.css?url";
import fontsCss from "@pinkslip/tokens/fonts.css?url";
import resetCss from "../styles/reset.css?url";
import baseCss from "../styles/base.css?url";

export const Route = createRootRoute({
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
      <a href="#main" className={styles.skip}>Skip to content</a>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>pinkslip</Link>
          <nav aria-label="Main navigation" className={styles.navigation}>
            <Link to="/">Jobs</Link>
            <Link to="/you">You</Link>
          </nav>
        </header>
        <main id="main" tabIndex={-1}><Outlet /></main>
        <footer className={styles.footer}><a href="/privacy">Privacy</a><a href="/support">Support</a></footer>
      </div>
      <Scripts />
    </body>
  </html>;
}
