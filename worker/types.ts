export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  ats_type: "greenhouse" | "lever" | "ashby" | "custom";
  ats_slug: string;
  website: string;
  enabled: number;
  added_at: string;
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
  dismissed: number;
}

export interface PreferenceRow {
  key: string;
  value: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
