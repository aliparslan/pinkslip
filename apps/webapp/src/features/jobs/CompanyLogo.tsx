import { useState } from "react";
import { companyMark } from "@pinkslip/core/utils";
import styles from "./CompanyLogo.module.css";

export type CompanyLogoSize = 24 | 32 | 44;

function hostname(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    return new URL(domain).hostname;
  } catch {
    return domain.replace(/^https?:\/\//, "").split("/")[0] || null;
  }
}

/** `CompanyLogo.svelte`: the company's favicon through the API's cached logo
 * proxy (so the browser never asks a third party which companies the user
 * views), falling back to the company's initials. Decorative: the company's
 * name is always written next to it. */
export function CompanyLogo({ name, domain, size = 24 }: { name: string; domain?: string | null; size?: CompanyLogoSize }) {
  const host = hostname(domain);
  const [failedHost, setFailedHost] = useState<string | null>(null);
  const src = host && failedHost !== host ? `/api/v2/logo?domain=${encodeURIComponent(host)}` : null;
  return <span className={styles.root} data-size={size} data-image={src ? true : undefined} aria-hidden>
    {src
      ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailedHost(host)} />
      : companyMark(name || "?")}
  </span>;
}
