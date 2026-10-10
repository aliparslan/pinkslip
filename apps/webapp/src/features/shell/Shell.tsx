import { Link, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BookmarksSimple, Briefcase, UserCircle, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { BrandMark } from "./BrandMark";
import styles from "./Shell.module.css";

interface Destination {
  label: string;
  to: "/" | "/library" | "/you";
  icon: PhosphorIcon;
  /** Routes that keep this destination selected. */
  match: string[];
}

const destinations: Destination[] = [
  { label: "Jobs", to: "/", icon: Briefcase, match: ["/", "/jobs/$jobId"] },
  { label: "Library", to: "/library", icon: BookmarksSimple, match: ["/library"] },
  { label: "You", to: "/you", icon: UserCircle, match: ["/you"] },
];

/**
 * App frame. Wide screens get a left sidebar: brand, then each destination as
 * a full row (the old desktop squeezed phone tab icons into a 232px rail and
 * stacked a second navigation column beside it on You). Phones keep the
 * bottom tab bar. Sub-sections such as You's settings nest under their
 * destination in the sidebar as their routes are ported.
 */
export function Shell({ children }: { children: ReactNode }) {
  const matchRoute = useMatchRoute();
  const isActive = (destination: Destination) =>
    destination.match.some((to) => Boolean(matchRoute({ to: to as never, fuzzy: to !== "/" })));

  return <div className={styles.frame}>
    <a href="#main" className={styles.skip}>Skip to content</a>
    <nav aria-label="Main navigation" className={styles.navigation}>
      <Link to="/" className={styles.brand} aria-label="Pinkslip home">
        <BrandMark />
        <span><span className={styles.brandPink}>pink</span>slip</span>
      </Link>
      <ul className={styles.destinations}>
        {destinations.map((destination) => {
          const active = isActive(destination);
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
          </li>;
        })}
      </ul>
      <div className={styles.legal}>
        <Link to="/privacy">Privacy</Link>
        <Link to="/support">Support</Link>
      </div>
    </nav>
    <main id="main" tabIndex={-1} className={styles.main}>{children}</main>
  </div>;
}
