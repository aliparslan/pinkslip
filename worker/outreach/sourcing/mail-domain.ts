/* Where a company's email lives. The website's domain is the first guess,
 * confirmed by its MX records over DNS-over-HTTPS (Workers can't query DNS
 * directly). */

export function websiteDomain(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export type MailProvider = "google" | "microsoft" | "gateway" | "other";

/** Google Workspace and Microsoft 365 usually say whether an address exists.
 * Security gateways in front (Proofpoint, Mimecast…) often accept anything,
 * which makes addresses there impossible to check. */
export function mailProvider(exchanges: string[]): MailProvider {
  const hosts = exchanges.join(" ").toLowerCase();
  if (/google\.com|googlemail\.com/.test(hosts)) return "google";
  if (/outlook\.com|office365|microsoft/.test(hosts)) return "microsoft";
  if (/pphosted|proofpoint|mimecast|barracuda|messagelabs|iphmx|fireeyecloud|trendmicro|sophos/.test(hosts)) return "gateway";
  return "other";
}

interface DnsJson {
  Status: number;
  Answer?: Array<{ type: number; data: string }>;
}

/** Mail exchanges for a domain, best first. Empty when it receives no mail. */
export async function lookupMx(domain: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const response = await fetcher(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!response.ok) throw new Error(`DNS lookup failed for ${domain}: ${response.status}`);
  const body = await response.json() as DnsJson;
  return (body.Answer ?? [])
    .filter((answer) => answer.type === 15)
    .map((answer) => {
      const [priority = "0", host = ""] = answer.data.trim().split(/\s+/);
      return { priority: Number(priority), host: host.replace(/\.$/, "").toLowerCase() };
    })
    // A null MX ("0 .") means the domain takes no mail.
    .filter((exchange) => exchange.host.length > 0)
    .sort((a, b) => a.priority - b.priority)
    .map((exchange) => exchange.host);
}

export interface MailDomain {
  domain: string;
  exchanges: string[];
  /** Where the domain came from: the catalog's website, or addresses that
   * "email format" pages show (notion.so's mail is at makenotion.com). */
  source: "website" | "format pages";
}

/** The domain the company's people have addresses at. Another domain the
 * format pages show wins when it receives mail and the website's domain
 * isn't among those shown. */
export async function chooseMailDomain(
  website: string,
  shown: string[],
  lookup: (domain: string) => Promise<string[]> = lookupMx,
): Promise<MailDomain> {
  const safeLookup = (domain: string) => lookup(domain).catch(() => [] as string[]);
  if (shown.length > 0 && !shown.includes(website)) {
    for (const domain of shown) {
      const exchanges = await safeLookup(domain);
      if (exchanges.length) return { domain, exchanges, source: "format pages" };
    }
  }
  const exchanges = await safeLookup(website);
  if (exchanges.length || shown.length === 0) return { domain: website, exchanges, source: "website" };
  for (const domain of shown) {
    const other = await safeLookup(domain);
    if (other.length) return { domain, exchanges: other, source: "format pages" };
  }
  return { domain: website, exchanges: [], source: "website" };
}
