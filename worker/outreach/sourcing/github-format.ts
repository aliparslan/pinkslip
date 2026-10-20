import { cleanPersonName, deriveTemplates, isRoleAddress, likelyTemplate } from "./email-pattern";
import { websiteDomain } from "./mail-domain";

/* A second opinion on a company's address format from its public GitHub
 * commits: engineers commit under their work address, which shows the
 * format for real (docs/recruiter-emails-2026-10-19.md). Only the format is
 * kept. GitHub's terms forbid using its data for unsolicited email, so the
 * addresses themselves are never stored or written to. */

export interface GithubFormat {
  org: string;
  template: string;
  /** How many of the addresses read agree on the template. */
  votes: number;
  total: number;
}

interface GithubOrg {
  login: string;
  blog?: string | null;
}

interface GithubRepo {
  name: string;
  fork: boolean;
}

interface GithubCommit {
  commit?: { author?: { name?: string | null; email?: string | null } | null };
}

const API = "https://api.github.com";
/** Orgs looked at by name, repositories read per org, commits per repository. */
const ORG_CANDIDATES = 3;
const REPOS = 4;
const COMMITS = 100;

export type GithubFetch = (path: string) => Promise<unknown | null>;

/** GitHub's REST API, with a token when there is one (5,000 requests an hour
 * instead of 60). Null on any failure, including the rate limit. */
export function githubApi(token: string | undefined, fetcher: typeof fetch = fetch): GithubFetch {
  return async (path) => {
    const response = await fetcher(`${API}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "pinkslip-recruiter-sourcing",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }).catch(() => null);
    if (!response?.ok) return null;
    return response.json().catch(() => null);
  };
}

/** The company's GitHub org: one whose profile links its website. */
async function findOrg(domain: string, get: GithubFetch): Promise<string | null> {
  const label = domain.split(".")[0] ?? domain;
  const search = await get(`/search/users?q=${encodeURIComponent(`${label} type:org`)}&per_page=${ORG_CANDIDATES}`) as { items?: GithubOrg[] } | null;
  for (const item of search?.items ?? []) {
    const org = await get(`/orgs/${encodeURIComponent(item.login)}`) as GithubOrg | null;
    const site = org?.blog ? websiteDomain(org.blog) : null;
    if (site && (site === domain || site.endsWith(`.${domain}`))) return item.login;
  }
  return null;
}

/** The format the company's commit addresses agree on, or null when its
 * org can't be found or nobody commits under the work address. */
export async function githubFormat(domain: string, get: GithubFetch): Promise<GithubFormat | null> {
  const org = await findOrg(domain, get);
  if (!org) return null;
  const repos = (await get(`/orgs/${encodeURIComponent(org)}/repos?sort=pushed&per_page=${REPOS * 3}`) as GithubRepo[] | null ?? [])
    .filter((repo) => !repo.fork)
    .slice(0, REPOS);
  const authors = new Map<string, string>();
  for (const repo of repos) {
    const commits = await get(`/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo.name)}/commits?per_page=${COMMITS}`) as GithubCommit[] | null;
    for (const entry of commits ?? []) {
      const email = entry.commit?.author?.email?.trim().toLowerCase() ?? "";
      const name = entry.commit?.author?.name ?? "";
      const at = email.lastIndexOf("@");
      if (at < 1 || !name) continue;
      const host = email.slice(at + 1);
      if (host !== domain && !host.endsWith(`.${domain}`)) continue;
      if (!authors.has(email)) authors.set(email, name);
    }
  }
  const evidence: Array<{ template: string }> = [];
  for (const [email, rawName] of authors) {
    const local = email.slice(0, email.lastIndexOf("@"));
    if (isRoleAddress(local)) continue;
    const name = cleanPersonName(rawName);
    const template = name ? deriveTemplates(name, local)[0] : undefined;
    if (template) evidence.push({ template });
  }
  const best = likelyTemplate(evidence);
  return best ? { org, ...best } : null;
}

/** Strong enough to use over the format pages. */
export function trustGithub(format: GithubFormat | null): format is GithubFormat {
  return format !== null && format.votes >= 2 && format.votes / format.total >= 0.75;
}
