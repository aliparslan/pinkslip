import styles from "./Shell.module.css";

/** Pinkslip's mark: the app icon's carbon copy, cut out of its tile (owner,
 * 2026-11-08: the flat stacked slips are gone everywhere). Below 40px it's
 * `public/brand/mark-small.svg`, which keeps the two slips, the tear and the
 * folded corner and drops the ruled lines; larger, the icon's own drawing.
 * The favicon and the share images are made from the same files
 * (`bun run icons`, `bun run share-image`). */
export function BrandMark({ size = 32 }: { size?: number }) {
  const src = size < 40 ? "/brand/mark-small.svg" : "/brand/mark.svg";
  return <img className={styles.mark} src={src} width={size} height={size} alt="" aria-hidden decoding="async" />;
}
