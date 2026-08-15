export interface Env {
  DB: D1Database;
  AI?: Ai;
  RESUME_BUCKET?: R2Bucket;
  /** Optional internal Service Binding; intentionally absent until approved. */
  RESUME_COMPILER?: Fetcher;
  EMAIL?: {
    send(message: {
      to: string;
      from: { email: string; name?: string };
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string | { email: string; name?: string };
      headers?: Record<string, string>;
    }): Promise<EmailSendResult>;
  };
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  ACCESS_CODE?: string;
  APPLE_APP_ID?: string;
  APPLE_TEAM_ID?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  WORKERS_AI_MODEL?: string;
  // APNs (native iOS push). Set APNS_KEY_ID/TEAM_ID/BUNDLE_ID as vars and
  // APNS_PRIVATE_KEY (the .p8 PEM contents) as a secret. APNS_SANDBOX="true"
  // targets the APNs sandbox host for Xcode debug / direct-install builds.
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_BUNDLE_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_SANDBOX?: string;
}

export interface Variables {
  userId: string;
  sessionId: string | null;
  sessionState: "anonymous" | "guest" | "authenticated";
  authTransport: "anonymous" | "cookie" | "native" | "api_token";
}

export interface UserRow {
  id: string;
  name: string;
  role: "user" | "admin";
  created_at: string;
}

export type CompanySourceType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "rippling"
  | "gem"
  | "smartrecruiters"
  | "yc"
  | "custom";

export interface CompanyRow {
  id: string;
  name: string;
  ats_type: "greenhouse" | "lever" | "ashby" | "custom";
  source_type: CompanySourceType | null;
  ats_slug: string;
  website: string;
  enabled: number;
  added_at: string;
  last_poll_status: string | null;
  last_poll_error: string | null;
  last_polled_at: string | null;
  /** Consecutive failed polls; reset to 0 on any success. */
  poll_failure_count: number;
  /**
   * Set once the failure streak crosses QUARANTINE_AFTER_FAILURES. Quarantined
   * sources are retried on a 24h backoff instead of every 15 minutes, and are
   * surfaced to admins as needing attention. Cleared on the next success.
   */
  quarantined_at: string | null;
}

export interface JobRow {
  id: string;
  company_id: string;
  external_id: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  posted_at: string | null;
  first_seen_at: string;
  evergreen: number;
  match_fact?: string;
  source_type?: CompanySourceType | null;
  dismissed: number;
  description: string | null;
  salary: string | null;
  closed_at: string | null;
}

export interface PreferenceRow {
  user_id?: string | null;
  key: string;
  value: string;
  updated_at?: string | null;
}

export interface TailoringRow {
  id: string;
  user_id: string;
  job_id: string;
  status: "planned" | "generated" | "failed";
  job_snapshot_json: string;
  profile_snapshot_json: string | null;
  profile_hash: string | null;
  evidence_json: string;
  requirements_json: string;
  plan_json: string;
  resume_draft_json: string | null;
  validation_json: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string;
  template_version: string;
  compiler_version: string;
  usage_id: string | null;
  initial_resume_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface FetchRunRow {
  id: string;
  scope: string;
  status: "running" | "ok" | "error";
  companies_attempted: number;
  companies_succeeded: number;
  companies_failed: number;
  new_jobs_found: number;
  notifications_sent: number;
  errors_json: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  // "web" for Web Push (p256dh/auth populated) or "ios" for APNs (endpoint holds
  // the device token; p256dh/auth are empty).
  platform: string;
}

export interface ProfileRow {
  user_id?: string | null;
  id?: number;
  data: string;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  state: "guest" | "authenticated";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
}

export interface AuthIdentityRow {
  id: string;
  user_id: string;
  provider: "apple" | "email";
  provider_subject: string;
  email: string | null;
  email_verified: number;
  created_at: string;
  last_used_at: string | null;
}

export type {
  DegreeType,
  OptionalSection,
  OptionalSectionKind,
  ResumeProfile,
} from "../shared/resume-profile";
