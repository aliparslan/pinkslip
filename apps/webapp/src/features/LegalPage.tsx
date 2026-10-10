import type { LegalPage as LegalContent } from "@pinkslip/domain/legal";
import styles from "../styles/Legal.module.css";

/** Privacy and support pages in the app's own type and colors. The body is
 * static, repository-owned HTML shared with the Hono Worker's copy. */
export function LegalPage({ page }: { page: LegalContent }) {
  return <article className={styles.page}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>Pinkslip</p>
      <h1 className={styles.title}>{page.title}</h1>
      <p className={styles.subtitle}>{page.subtitle}</p>
    </header>
    <div className={styles.body} dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
  </article>;
}

export function legalHead(page: LegalContent) {
  return {
    meta: [
      { title: `${page.title} · Pinkslip` },
      { name: "description", content: page.description },
    ],
    links: [{ rel: "canonical", href: `https://pinkslip.work${page.path}` }],
  };
}
