import { Link, useCanGoBack, useMatches, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, BookmarksSimple, Briefcase, UserCircle, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { ButtonAnchor, Text } from "../../kit";
import { adminPages, libraryPages, pages, youPages, type SectionPath } from "../navigation/pages";
import { backTarget, jobRoot } from "../navigation/back-target";
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
 * App frame. Wide screens get a left sidebar: brand, then each destination as
 * a full row (the old desktop squeezed phone tab icons into a 232px rail and
 * stacked a second navigation column beside it on You). Phones keep the
 * bottom tab bar. Sub-sections such as You's settings nest under their
 * destination in the sidebar as their routes are ported.
 */
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const location = useRouterState({ select: (state) => state.location });
  const page = useMatches({ select: (matches) => matches.at(-1)?.staticData.page });
  const root = page?.root === "jobs" && page.depth > 0 && jobRoot(location.search) !== "/" ? "library" : page?.root;
  const sectionPaths = page?.shell === "admin" ? adminPages : root === "library" ? libraryPages : root === "you" ? youPages : null;
  const sectionLabel = page?.shell === "admin" ? "Admin navigation" : root === "library" ? "Library navigation" : "You navigation";
  const isYouOverview = page?.shell === "consumer" && root === "you" && page.depth === 0;
  const phoneSections = sectionPaths && (page?.depth === 0 || page?.shell === "admin")
    ? <nav aria-label={sectionLabel} className={styles.phoneSections} data-section={isYouOverview ? "you" : undefined}>
      <SectionLinks paths={sectionPaths} pathname={location.pathname} />
    </nav> : null;
  const goBack = () => {
    if (canGoBack) router.history.back();
    else if (page) void router.navigate({ href: backTarget(page, location.pathname, location.search), replace: true });
  };

  return <div className={styles.frame}>
    <a href="#main" className={styles.skip}>Skip to content</a>
    <nav aria-label="Main navigation" className={styles.navigation}>
      <Link to="/" className={styles.brand} aria-label="Pinkslip home">
        <BrandMark />
        <span><span className={styles.brandPink}>pink</span>slip</span>
      </Link>
      <ul className={styles.destinations}>
        {destinations.map((destination) => {
          const active = root === destination.root;
          const Glyph = destination.icon;
          return <li key={destination.to}>
            <Link
              to={destination.to}
              className={styles.destination}
              data-active={active || undefined}
              aria-current={active ? "page" : undefined}
            >
              <Glyph size={22} weight={active ? "fill" : "regular"} aria-hidden />
              <span>{destination.label}</span>
            </Link>
            {active && sectionPaths && <div className={styles.sidebarSections}>
              {page?.shell === "admin" && <Text size="xs" tone="ink-3">Admin</Text>}
              <SectionLinks paths={sectionPaths} pathname={location.pathname} />
            </div>}
          </li>;
        })}
      </ul>
      <div className={styles.legal}>
        <Link to="/privacy">Privacy</Link>
        <Link to="/support">Support</Link>
      </div>
    </nav>
    <main id="main" tabIndex={-1} className={styles.main}>
      {page && page.depth > 0 && <div className={styles.back}>
        <ButtonAnchor variant="secondary" size="compact" icon={ArrowLeft}
          href={backTarget(page, location.pathname, location.search)}
          onClick={(event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            goBack();
          }}>Back</ButtonAnchor>
      </div>}
      {!isYouOverview && phoneSections}
      <div className={styles.content}>{children}</div>
      {isYouOverview && phoneSections}
    </main>
  </div>;
}
