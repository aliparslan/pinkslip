/**
 * A company's event as the apps get it (docs/backend-inventory-2026-10-16.md,
 * Decisions: Following and events): an info session or fair, added in Admin.
 * Times are instants; each person sees them in their own time zone.
 */
export interface CompanyEvent {
  id: string;
  company_id: string;
  company_name: string;
  company_domain: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  /** "Online", or where it's held. */
  location: string;
  online: boolean;
  /** Their page; Sign up opens it. */
  url: string;
  signup_closes_at: string | null;
  /** Who it's for ("New grads", "Everyone"). */
  audience: string;
  host: string;
  about: string;
  points: string[];
  /** The viewer asked to be reminded (N19, the day before). */
  reminded: boolean;
}
