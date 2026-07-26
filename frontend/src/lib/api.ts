const BASE = "/api";

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const data = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : undefined;
    const message = typeof data?.error === "string" ? data.error : `API error: ${res.status}`;
    const code = typeof data?.code === "string" ? data.code : undefined;
    throw new ApiError(message, res.status, code, payload);
  }

  return payload as T;
}

export interface Job {
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
  company_name: string;
  company_domain: string;
  ats_type?: string;
  ats_slug?: string;
  saved?: boolean | number;
  content_pending?: boolean;
  content_refresh_after_ms?: number | null;
  match_reasons?: string[];
  scorer_version?: string | null;
}

export interface Company {
  id: string;
  name: string;
  ats_type: string;
  ats_slug: string;
  website: string;
  enabled: boolean | number;
  last_poll_status: string | null;
  last_poll_error: string | null;
  last_polled_at: string | null;
  blocked?: boolean | number;
}

export interface ContentReport {
  id: string;
  company_id: string | null;
  job_id: string | null;
  report_type: string;
  notes: string;
  status: "open" | "resolved" | "dismissed";
  admin_response: string | null;
  created_at: string;
  company_name: string | null;
  job_title: string | null;
}

export interface FeedbackSubmission {
  id: string;
  user_id: string;
  submission_type: "company_request" | "feature_request" | "general_feedback";
  title: string;
  details: string;
  careers_url: string | null;
  status: "new" | "planned" | "resolved" | "declined";
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  user_name?: string | null;
}

export interface ProductMetrics {
  period_days: number;
  notification_latency_seconds: number;
  notification_open_rate: number;
  notifications_sent: number;
  apply_clicks_within_one_hour: number;
  high_score_dismissal_rate: number;
  users_with_enough_matches: number;
  total_profiles: number;
  onboarding_completion_rate: number;
  accounts_created: number;
  push_registrations: number;
  profile_adjustments: number;
  tailoring_to_application_rate: number;
  open_reports: number;
  open_feedback: number;
  events: Record<string, number>;
}

export interface Application {
  id: string;
  user_id: string | null;
  job_id: string | null;
  company_name: string;
  title: string;
  stage: string;
  next: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  role: "user" | "admin";
  created_at: string;
}

export interface SessionInfo {
  state: "anonymous" | "guest" | "authenticated";
}

export interface AccountInfo {
  authenticated: boolean;
  email: string | null;
  provider?: "apple" | "email" | null;
  providers: string[];
  identity_count?: number;
}

export interface AppFeatures {
  access_required: boolean;
  tailoring_enabled: boolean;
  tailoring_provider: "gemini" | "anthropic" | null;
  tailoring_model: string;
}

export interface CorpusVersion {
  id: number;
  content_md: string;
  label: string | null;
  created_at: string;
  updated_at: string;
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

export interface Tailoring {
  id: string;
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
  resume_md_final: string | null;
  cover_letter_md_final: string | null;
  qa_json_final: string | null;
}

export interface TailorUsage {
  provider: "gemini" | "anthropic";
  model: string;
  app_today: number;
  user_today: number;
  daily_limit: number | null;
  app_remaining: number | null;
  user_remaining: number | null;
  resets_at: string;
}

export interface FetchRun {
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

export interface VerifyCompanyResult {
  ok: boolean;
  error?: string;
  total_jobs?: number;
  sample_jobs?: Array<{
    externalId: string;
    title: string;
    url: string;
    location: string;
    department: string | null;
    postedAt: string | null;
    description: string | null;
    salary: string | null;
  }>;
}

export interface JobsListMeta {
  total: number;
  count?: number;
  has_more?: boolean;
  next_offset?: number;
}

export interface ResumeAssetRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  extractedText: string | null;
  dataUrl: string | null;
}

export interface MeResponse {
  user: User | null;
  session: SessionInfo;
  account: AccountInfo | null;
  is_admin: boolean;
  features?: AppFeatures;
}

export interface PreferenceState {
  search_profile: SearchProfileV1;
  notify_threshold: number;
}

export interface MatchPreviewJob {
  id: string;
  title: string;
  location: string;
  posted_at: string | null;
  first_seen_at: string;
  salary: string | null;
  company_name: string;
  company_domain: string;
  score: number;
  match_reasons: string[];
}

export const api = {
  jobs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ jobs: Job[]; meta: JobsListMeta }>(`/jobs${qs}`);
    },
    get: (id: string) => request<Job>(`/jobs/${id}`),
    dismiss: (id: string) =>
      request<Job>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed: true }),
      }),
    undismiss: (id: string) =>
      request<Job>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed: false }),
      }),
    block: (id: string) =>
      request<void>(`/jobs/${id}/block`, { method: "DELETE" }),
  },
  companies: {
    list: (atsType?: string) => {
      const qs = atsType ? `?ats_type=${atsType}` : "";
      return request<{ companies: Company[] }>(`/companies${qs}`);
    },
    toggle: (id: string, enabled: boolean) =>
      request<Company>(`/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    update: (id: string, data: { name?: string; ats_type?: string; ats_slug?: string }) =>
      request<Company>(`/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    poll: (id: string) =>
      request<Company & { new_jobs?: number }>(`/companies/${id}/poll`, { method: "POST" }),
    delete: (id: string) =>
      request<void>(`/companies/${id}`, { method: "DELETE" }),
    create: (data: {
      name: string;
      ats_type: string;
      ats_slug: string;
      website?: string;
    }) =>
      request<Company>("/companies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    verify: (data: { ats_type: string; ats_slug: string }) =>
      request<VerifyCompanyResult>("/companies/verify", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    block: (id: string) =>
      request<{ blocked: boolean }>(`/interactions/companies/${id}/block`, { method: "POST" }),
    restore: (id: string) =>
      request<{ blocked: boolean }>(`/interactions/companies/${id}/block`, { method: "DELETE" }),
  },
  preferences: {
    get: () => request<PreferenceState>("/preferences"),
    preview: () => request<{ jobs: MatchPreviewJob[] }>("/preferences/preview"),
    update: (prefs: Partial<PreferenceState>) =>
      request<PreferenceState>("/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
  },
  push: {
    settings: () =>
      request<{
        enabled: boolean;
        push_enabled: boolean;
        threshold: number;
        updated_at: string | null;
        vapid_public_key: string | null;
      }>("/push/settings"),
    updateSettings: (data: { enabled?: boolean; push_enabled?: boolean; threshold?: number }) =>
      request<{ enabled: boolean; push_enabled: boolean; threshold: number }>("/push/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    opened: (jobIds: string | string[]) =>
      request<void>("/push/opened", {
        method: "POST",
        body: JSON.stringify({
          job_ids: Array.isArray(jobIds) ? jobIds : [jobIds],
        }),
      }),
    subscribe: (subscription: PushSubscription) =>
      request<{ ok: boolean }>("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      }),
    unsubscribe: (endpoint: string) =>
      request<{ ok: boolean }>("/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }),
    // Native iOS: register an APNs device token for the current user.
    registerApns: (token: string) =>
      request<{ id: string }>("/push/apns", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    test: (delay = 0) =>
      request<{ sent: number; total: number }>(`/push/test${delay ? `?delay=${delay}` : ""}`, {
        method: "POST",
      }),
  },
  auth: {
    // Mint (or fetch) a bearer token for native extensions (Widgets, Share).
    getToken: () =>
      request<{ token: string }>("/auth/token", { method: "POST" }),
    signInWithApple: (data: {
      identityToken: string;
      authorizationCode?: string;
      user?: string;
      email?: string;
      fullName?: string;
      nonce?: string;
    }) =>
      request<MeResponse>("/auth/apple/exchange", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    startEmailLogin: (email: string) =>
      request<{ ok: boolean; expires_at: string }>("/auth/email/start", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    verifyEmailToken: (token: string) =>
      request<MeResponse>("/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    logout: () =>
      request<MeResponse>("/auth/logout", { method: "POST" }),
    deleteAccount: () =>
      request<MeResponse>("/auth/account", { method: "DELETE" }),
  },
  stats: {
    get: () =>
      request<{
        totalJobs: number;
        newToday: number;
        activeCompanies: number;
        activeApplications: number;
        savedJobs: number;
        lastPolled: string | null;
      }>("/stats"),
  },
  applications: {
    list: (stage?: string) => {
      const qs = stage ? `?stage=${stage}` : "";
      return request<{ applications: Application[] }>(`/applications${qs}`);
    },
    create: (data: { job_id?: string; company_name: string; title: string; stage?: string; next?: string; url?: string }) =>
      request<Application>("/applications", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { company_name?: string; title?: string; stage?: string; next?: string; url?: string }) =>
      request<Application>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/applications/${id}`, { method: "DELETE" }),
  },
  events: {
    list: (params?: { company_id?: string; upcoming?: string }) => {
      const qs = params ? "?" + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
      ).toString() : "";
      return request<{ events: Record<string, unknown>[] }>(`/events${qs}`);
    },
    create: (data: { company_id?: string; company_name?: string; title: string; description?: string; event_type?: string; event_date: string; location?: string; url?: string }) =>
      request<Record<string, unknown>>("/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/events/${id}`, { method: "DELETE" }),
  },
  me: {
    get: () => request<MeResponse>("/me"),
    update: (data: { name: string }) =>
      request<MeResponse>("/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  access: {
    unlock: (code: string) =>
      request<{ ok: boolean; required: boolean }>("/access", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
  },
  savedJobs: {
    list: () => request<{ jobs: Job[] }>("/jobs/saved/list"),
    save: (id: string) =>
      request<Job>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ saved: true }),
      }),
    unsave: (id: string) =>
      request<Job>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ saved: false }),
      }),
  },
  profile: {
    get: () =>
      request<{ data: ResumeProfile; id: number | null; updated_at: string | null }>("/profile"),
    update: (data: ResumeProfile, options?: { keepalive?: boolean }) =>
      request<{ data: ResumeProfile; id: number | null; updated_at: string | null }>("/profile", {
        method: "PUT",
        body: JSON.stringify({ data }),
        keepalive: options?.keepalive,
      }),
  },
  resumeAssets: {
    get: () => request<{ asset: ResumeAssetRecord | null }>("/resume-assets"),
    upload: (data: {
      fileName: string;
      mimeType: string;
      size: number;
      dataUrl: string;
      extractedText?: string | null;
    }) =>
      request<{ asset: ResumeAssetRecord }>("/resume-assets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteActive: () =>
      request<void>("/resume-assets/active", { method: "DELETE" }),
  },
  corpus: {
    get: () =>
      request<{ content_md: string; version_id: number | null; updated_at: string | null; label?: string | null }>("/corpus"),
    update: (content_md: string, options?: { keepalive?: boolean }) =>
      request<{ content_md: string; version_id: number | null; updated_at: string | null; label?: string | null }>("/corpus", {
        method: "PUT",
        body: JSON.stringify({ content_md }),
        keepalive: options?.keepalive,
      }),
    versions: () => request<{ versions: Array<Omit<CorpusVersion, "content_md">> }>("/corpus/versions"),
    version: (id: number | string) => request<CorpusVersion>(`/corpus/versions/${id}`),
    snapshot: (label: string) =>
      request<{ version_id: number | null }>("/corpus/snapshot", {
        method: "POST",
        body: JSON.stringify({ label }),
      }),
  },
  tailor: {
    get: (jobId: string) => request<{ tailoring: Tailoring | null }>(`/tailor/${jobId}`),
    usage: (model?: string) => {
      const qs = model ? `?model=${encodeURIComponent(model)}` : "";
      return request<{ usage: TailorUsage }>(`/tailor/usage${qs}`);
    },
    save: (
      id: string,
      data: {
        user_edited_resume_md?: string;
        user_edited_cover_md?: string;
        user_edited_qa_json?: string;
      }
    ) =>
      request<{ tailoring: Tailoring }>(`/tailorings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  runs: {
    list: (limit = 50) => request<{ runs: FetchRun[] }>(`/runs?limit=${limit}`),
  },
  ops: {
    refreshAll: (limit?: number) =>
      request<{ companiesPolled: number; newJobsFound: number; log: string[] }>(
        `/poll${limit ? `?limit=${limit}` : ""}`,
        { method: "POST" }
      ),
  },
  interactions: {
    viewedJobs: () =>
      request<{ job_ids: string[] }>("/interactions/viewed-jobs"),
    markViewed: (jobId: string) =>
      request<void>(`/interactions/viewed-jobs/${jobId}`, { method: "POST" }),
    report: (data: {
      company_id?: string;
      job_id?: string;
      report_type: string;
      notes?: string;
    }) =>
      request<{ id: string; status: string }>("/interactions/reports", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    reports: (status = "open") =>
      request<{ reports: ContentReport[] }>(`/interactions/reports?status=${encodeURIComponent(status)}`),
    updateReport: (id: string, data: { status: string; admin_response?: string }) =>
      request<{ ok: boolean }>(`/interactions/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    submitFeedback: (data: {
      submission_type: FeedbackSubmission["submission_type"];
      title: string;
      details?: string;
      careers_url?: string;
    }) =>
      request<{ feedback: FeedbackSubmission; duplicate: boolean }>("/interactions/feedback", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    feedback: (status = "active") =>
      request<{ feedback: FeedbackSubmission[] }>(
        `/interactions/feedback?status=${encodeURIComponent(status)}`
      ),
    updateFeedback: (
      id: string,
      data: { status: FeedbackSubmission["status"]; admin_response?: string }
    ) =>
      request<{ ok: boolean }>(`/interactions/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    event: (data: {
      event_name: string;
      entity_type?: string;
      entity_id?: string;
      properties?: Record<string, string | number | boolean>;
    }) =>
      request<void>("/interactions/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  metrics: {
    get: () => request<ProductMetrics>("/metrics"),
  },
};
import type { SearchProfileV1 } from "../../../shared/search-profile";
