import { CANONICAL_ORIGIN } from "../../server/routing";

/** The link preview image (`bun run share-image` writes it). */
const DEFAULT_IMAGE = { url: `${CANONICAL_ORIGIN}/og-image.png`, alt: "Pinkslip: early-career jobs, straight from the source", width: "1200", height: "630" };

export interface PublicHead {
  /** The full document title. */
  title: string;
  /** The social title; defaults to `title`. */
  shareTitle?: string;
  description: string;
  /** Canonical path on pinkslip.work, whichever host served the page. */
  path: string;
  type?: "website" | "article";
  /** JSON-LD, rendered as one `application/ld+json` script. */
  structuredData?: Record<string, unknown>;
  /** The share text, when it isn't the page's description. */
  shareDescription?: string;
  /** The page's own link preview (a job's card); the site's otherwise. */
  image?: { url: string; alt: string };
}

/** Head tags for a public, indexable page: description, canonical (always
 * pinkslip.work), Open Graph and Twitter cards, and optional JSON-LD. */
export function publicHead({ title, shareTitle = title, description, shareDescription = description, path, type = "website", structuredData, image }: PublicHead) {
  const url = `${CANONICAL_ORIGIN}${path}`;
  const preview = image ? { ...DEFAULT_IMAGE, ...image } : DEFAULT_IMAGE;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:site_name", content: "Pinkslip" },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:title", content: shareTitle },
      { property: "og:description", content: shareDescription },
      { property: "og:image", content: preview.url },
      { property: "og:image:alt", content: preview.alt },
      { property: "og:image:width", content: preview.width },
      { property: "og:image:height", content: preview.height },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: shareTitle },
      { name: "twitter:description", content: shareDescription },
      { name: "twitter:image", content: preview.url },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: structuredData
      ? [{ type: "application/ld+json", children: JSON.stringify(structuredData).replace(/</g, "\\u003c") }]
      : [],
  };
}
