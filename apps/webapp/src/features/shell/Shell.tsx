import { Link, useCanGoBack, useMatches, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BookmarksSimple, Briefcase, CaretLeft, UserCircle, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { IconButtonAnchor, Tooltip } from "../../kit";
import { adminPages, pages, type SectionPath } from "../navigation/pages";
import { backTarget, jobRoot } from "../navigation/back-target";
import { OfflineBanner } from "../states/OfflineBanner";
import { rememberedFeedSearch } from "../feed/criteria";
import { BrandMark } from "./BrandMark";
import styles from "./Shell.module.css";

interface Destination {
  label: string;
  to: "/" | "/library/saved" | "/you";
  root: "jobs" | "library" | "you";
  icon: PhosphorIcon;
}

const destinations: Destination[] = [
  { label: "Jobs", to: "/", root: "jobs", icon: Briefcase },
  { label: "Library", to: "/library/saved", root: "library", icon: BookmarksSimple },
  { label: "You", to: "/you", root: "you", icon: UserCircle },
];

function SectionLinks({ paths, pathname }: { paths: readonly SectionPath[]; pathname: string }) {
  return <ul className={styles.sections}>
    {paths.map((to) => <li key={to}><Link to={to}
      className={styles.sectionLink} aria-current={pathname.replace(/\/$/, "") === to ? "page" : undefined}
    >{pages[to].title}</Link></li>)}
  </ul>;
}

/**
 * App frame. Wide screens get a narrow icon rail: the mark, then each
 * destination as an icon with its name in a tooltip (the name is also the
 * link's text, visually hidden there). Phones keep the bottom tab bar with
 * labels. You's sections live on the You screen; admin pages get a section
 * bar above the content at every width. Pages below a root get the current design's
 * screen bar: an icon-only Back and the centered title. Library's Saved and
 * Applied tabs and You's grouped list belong to those screens, not the shell.
 */
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const location = useRouterState({ select: (state) => state.location });
  const page = useMatches({ select: (matches) => matches.at(-1)?.staticData.page });
  const root = page?.root === "jobs" && page.depth > 0 && jobRoot(location.search) !== "/" ? "library" : page?.root;
  const admin = page?.shell === "admin";
  const goBack = () => {
    if (canGoBack) router.history.back();
    else if (page) void router.navigate({ href: backTarget(page, location.pathname, location.search), replace: true });
  };

  // Onboarding brings its own frame and landmarks.
  if (page?.shell === "focus") return <><OfflineBanner />{children}</>;

  return <div className={styles.frame}>
    <a href="#main" className={styles.skip}>Skip to content</a>
    <nav aria-label="Main navigation" className={styles.navigation}>
      <Link to="/" className={styles.brand} aria-label="Pinkslip home">
        <BrandMark />
      </Link>
      <ul className={styles.destinations}>
        {destinations.map((destination) => {
          const active = root === destination.root;
          const Glyph = destination.icon;
          return <li key={destination.to}>
            <Tooltip content={destination.label} side="right">
              <Link
                to={destination.to}
                // Jobs returns to the filters it was left with.
                search={destination.to === "/" ? rememberedFeedSearch() : undefined}
                className={styles.destination}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
              >
                <Glyph size={22} weight={active ? "fill" : "regular"} aria-hidden />
                <span className={styles.label}>{destination.label}</span>
              </Link>
            </Tooltip>
          </li>;
        })}
      </ul>
    </nav>
    <main id="main" tabIndex={-1} className={styles.main} data-split={page?.split || undefined}>
      {/* The screen bar is inside the transition group so it moves with its
          page; outside it, the group animated from below the old page's top
          and looked like the content being pushed down. */}
      <div className={styles.content}>
      {page && page.depth > 0 && <header className={styles.screenNav}>
        <IconButtonAnchor icon={CaretLeft} label="Back" iconSize={22} tone="strong"
          href={backTarget(page, location.pathname, location.search)}
          onClick={(event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            goBack();
          }} />
        <div className={styles.screenTitle} aria-hidden>{page.title}</div>
      </header>}
      {admin && <nav aria-label="Admin navigation" className={styles.sectionNav}>
        <SectionLinks paths={adminPages} pathname={location.pathname} />
      </nav>}
      <OfflineBanner />
      {children}
      </div>
    </main>
  </div>;
}
