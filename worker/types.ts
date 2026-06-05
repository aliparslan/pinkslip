export interface Env {
  DB: D1Database;
  RESUME_BUCKET?: R2Bucket;
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
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
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
  sessionState: "guest" | "authenticated";
}

export interface UserRow {
  id: string;
  name: string;
  created_at: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  ats_type: "greenhouse" | "lever" | "ashby" | "custom";
  ats_slug: string;
  website: string;
  enabled: number;
  added_at: string;
  last_poll_status: string | null;
  last_poll_error: string | null;
  last_polled_at: string | null;
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
  score: number;
  title_score: number;
  yoe_score: number;
  location_score: number;
  department_score: number;
  recency_score: number;
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

export interface CorpusVersionRow {
  id: number;
  user_id?: string | null;
  content_md: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface TailoringRow {
  id: string;
  user_id?: string | null;
  job_id: string;
  corpus_version_id: number;
  resume_md: string | null;
  cover_letter_md: string | null;
  qa_json: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  created_at: string;
  user_edited_resume_md: string | null;
  user_edited_cover_md: string | null;
  user_edited_qa_json: string | null;
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

export interface ApplicationRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
  company_name: string;
  title: string;
  stage: "Applied" | "Screen" | "Interview" | "Offer" | "Rejected" | "Ghosted";
  next: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  company_id: string | null;
  company_name: string;
  title: string;
  description: string;
  event_type: string;
  event_date: string;
  location: string;
  url: string;
  created_at: string;
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

export interface ResumeAssetRow {
  id: string;
  user_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
  storage_key: string;
  extracted_text: string | null;
  is_active: number;
}

export type OptionalSectionKind = "leadership" | "certifications" | "publications" | "awards" | "volunteer";

export interface OptionalSection {
  kind: OptionalSectionKind;
  items: Array<{ category: string; items: string }>;
}

export interface ResumeProfile {
  contact: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    website: string;
  };
  experience: Array<{
    id: string;
    company: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    location: string;
    startDate: string;
    endDate: string;
    gpa?: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    role: string;
    teamInfo: string;
    url: string;
    bullets: string[];
  }>;
  skills: Array<{
    category: string;
    items: string;
  }>;
  optionalSections: OptionalSection[];
}
