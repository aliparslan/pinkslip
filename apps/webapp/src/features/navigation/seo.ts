import { CANONICAL_ORIGIN } from "../../server/routing";

/** The social preview for pages without their own image: the app's jobs
 * screen. */
const DEFAULT_IMAGE = { url: `${CANONICAL_ORIGIN}/screenshots/jobs-wide.jpg`, alt: "Pinkslip's job feed" };

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
}

/** Head tags for a public, indexable page: description, canonical (always
 * pinkslip.work), Open Graph and Twitter cards, and optional JSON-LD. */
export function publicHead({ title, shareTitle = title, description, path, type = "website", structuredData }: PublicHead) {
  const url = `${CANONICAL_ORIGIN}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:site_name", content: "Pinkslip" },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:title", content: shareTitle },
      { property: "og:description", content: description },
      { property: "og:image", content: DEFAULT_IMAGE.url },
      { property: "og:image:alt", content: DEFAULT_IMAGE.alt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: shareTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: DEFAULT_IMAGE.url },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: structuredData
      ? [{ type: "application/ld+json", children: JSON.stringify(structuredData).replace(/</g, "\\u003c") }]
      : [],
  };
}
