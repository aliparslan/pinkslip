import type { ResumeProfile } from "../../../../shared/resume-profile";
import type { RoleId } from "../../../../shared/search-profile";
import type {
  StructuredTailoring,
  TailoredResume,
  TailoringArtifact,
  TailoringValidation,
} from "../../../../shared/tailoring";
export type {
  DegreeType,
  OptionalSection,
  OptionalSectionKind,
  ResumeProfile,
} from "../../../../shared/resume-profile";

export interface ApiClientConfig {
  baseUrl?: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  onAccessToken?: (token: string) => void | Promise<void>;
  onInvalidAccessToken?: (rejectedToken: string | null) => void | Promise<void>;
  client?: "web" | "ios";
}

let clientConfig: Required<Pick<ApiClientConfig, "baseUrl" | "client">> & ApiClientConfig = {
  baseUrl: "/api/v2",
  client: "web",
};

export function configureApiClient(config: ApiClientConfig): void {
  clientConfig = {
    ...clientConfig,
    ...config,
    baseUrl: (config.baseUrl ?? clientConfig.baseUrl).replace(/\/$/, ""),
  };
}

/** Resolve an API-relative path against the active client origin. The web app
 * keeps its same-origin `/api/v2` base, while the packaged iOS WebView uses the
 * configured HTTPS origin instead of resolving assets under capacitor://. */
export function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${clientConfig.baseUrl}${normalizedPath}`;
}

/** Fetch a response body without consuming it while preserving the configured
 * native API origin and bearer session. Used by streaming endpoints. */
export async function apiFetch(path: string, options?: RequestInit, allowTokenRecovery = true): Promise<Response> {
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  if (!headers.has("Content-Type") && !isFormData) headers.set("Content-Type", "application/json");
  if (clientConfig.client === "ios") headers.set("X-Pinkslip-Client", "ios");
  const requestAccessToken = await clientConfig.getAccessToken?.() ?? null;
  if (requestAccessToken) headers.set("Authorization", `Bearer ${requestAccessToken}`);

  const response = await fetch(resolveApiUrl(path), {
    credentials: "include",
    ...options,
    headers,
  });

  if (response.status === 401 && allowTokenRecovery && clientConfig.onInvalidAccessToken) {
    const payload = await response.clone().json().catch(() => null) as { code?: string } | null;
    if (payload?.code === "invalid_token") {
      await response.body?.cancel().catch(() => undefined);
      await clientConfig.onInvalidAccessToken(requestAccessToken);
      return apiFetch(path, options, false);
    }
  }
  return response;
}

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

async function request<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 20_000
): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  let res: Response | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await apiFetch(path, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (attempt + 1 < attempts) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 260));
        continue;
      }
      if (controller.signal.aborted) {
        throw new ApiError("This is taking longer than expected. Please try again.", 408, "request_timeout");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

    if (retryableStatuses.has(res.status) && attempt + 1 < attempts) {
      await res.body?.cancel().catch(() => undefined);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 260));
      continue;
    }
    break;
  }

  if (!res) throw new ApiError("Could not reach pinkslip. Please try again.", 503, "network_unavailable");

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (typeof payload === "object" && payload !== null) {
    const nextToken = (payload as Record<string, unknown>).native_token;
    if (typeof nextToken === "string" && nextToken) {
      await clientConfig.onAccessToken?.(nextToken);
    }
  }

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
  evergreen: boolean | number;
  match_fact?: string | null;
  specialties?: RoleId[];
  sponsorship_available?: boolean | null;
  source_type?: string | null;
  dismissed: number;
  description: string | null;
  salary: string | null;
  closed_at: string | null;
  company_name: string;
  company_domain: string;
  ats_type?: string;
  ats_slug?: string;
  saved?: boolean | number;
  applied?: boolean | number;
  applied_at?: string;
  content_pending?: boolean;
  content_refresh_after_ms?: number | null;
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
  /** Consecutive failed polls; 0 once a poll succeeds. */
  poll_failure_count?: number;
  /**
   * When this source was first quarantined ("broken since"). Quarantined
   * sources back off to one retry a day instead of every 15 minutes, and are
   * listed under the admin "Needs fixing" filter.
   */
  quarantined_at?: string | null;
  blocked?: boolean | number;
}

export type ResumeImportErrorCode =
  | "authentication_required"
  | "file_too_large"
  | "unsupported_type"
  | "invalid_pdf"
  | "protected_pdf"
  | "no_extractable_text"
  | "offline"
  | "conversion_unavailable"
  | "import_rate_limited"
  | "unknown";

export interface ResumeImportResult {
  profile: ResumeProfile;
  counts: {
    experience: number;
    education: number;
    projects: number;
    skills: number;
    additional: number;
  };
  warnings: string[];
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

export interface JobReview {
  job_id: string;
  state: "needs_review" | "approved" | "rejected";
  reason_codes: string[];
  evidence: {
    title?: string;
    description_excerpt?: string;
    min_years?: number | null;
    seniority?: string;
    requires_advanced_degree?: boolean;
  };
  classifier_version: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  title: string;
  url: string;
  location: string;
  company_name: string;
}

export interface ProductMetrics {
  period_days: number;
  notification_latency_seconds: number;
  notification_open_rate: number;
  notifications_sent: number;
  apply_clicks_within_one_hour: number;
  eligible_job_dismissal_rate: number;
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
  tailoring_provider: "workers_ai" | null;
  tailoring_model: string;
}

export type Tailoring = StructuredTailoring;
export type { StructuredTailoring, TailoredResume, TailoringArtifact, TailoringValidation };

export interface TailorUsage {
  provider: "workers_ai";
  model: string;
  app_today: number;
  user_today: number;
  included_user_today: number;
  daily_limit: number | null;
  app_remaining: number | null;
  user_remaining: number | null;
  included_user_remaining: number | null;
  provider_units_today: number;
  provider_units_limit: number | null;
  provider_units_remaining: number | null;
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

export interface MeResponse {
  user: User | null;
  session: SessionInfo;
  account: AccountInfo | null;
  is_admin: boolean;
  features?: AppFeatures;
  native_token?: string;
}

export interface PreferenceState {
  search_profile: SearchProfileV1;
}

export const api = {
  native: {
    startSession: () =>
      request<{ token: string; expires_at: string; session: SessionInfo }>(
        "/native/session",
        { method: "POST" }
      ),
  },
  bootstrap: {
    get: () => request<{ me: MeResponse; preferences: PreferenceState }>("/bootstrap", undefined, 12_000),
  },
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
    markApplied: (id: string) =>
      request<Job>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ applied: true, dismissed: true }),
      }),
    unmarkApplied: (id: string) =>
      request<Job>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ applied: false, dismissed: false }),
      }),
  },
  companies: {
    list: (atsType?: string) => {
      const qs = atsType ? `?ats_type=${atsType}` : "";
      return request<{ companies: Company[] }>(`/companies${qs}`, undefined, 12_000);
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
      request<Company & { new_jobs?: number }>(`/companies/${id}/poll`, { method: "POST" }, 60_000),
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
        updated_at: string | null;
        vapid_public_key: string | null;
      }>("/push/settings"),
    updateSettings: (data: { enabled?: boolean; push_enabled?: boolean }) =>
      request<{ enabled: boolean; push_enabled: boolean }>("/push/settings", {
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
        appliedJobs: number;
        savedJobs: number;
        lastPolled: string | null;
      }>("/stats"),
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
  appliedJobs: {
    list: () => request<{ jobs: Job[] }>("/jobs/applied/list"),
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
  resumeImport: {
    parse: (file: File) => {
      const body = new FormData();
      body.set("file", file, file.name);
      return request<ResumeImportResult>("/resume-import/parse", {
        method: "POST",
        body,
      }, 45_000);
    },
  },
  tailor: {
    get: (jobId: string) => request<{ tailoring: Tailoring | null }>(`/tailor/${jobId}`),
    plan: (jobId: string) =>
      request<{ tailoring: StructuredTailoring }>(`/tailor/${jobId}/plan`, {
        method: "POST",
      }, 60_000),
    generate: (
      id: string,
      data: { selectedEvidenceIds: string[]; excludedEvidenceIds?: string[] }
    ) => request<{ tailoring: StructuredTailoring }>(`/tailorings/${id}/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }, 90_000),
    usage: (model?: string) => {
      const params = new URLSearchParams();
      if (model) params.set("model", model);
      const qs = params.size ? `?${params.toString()}` : "";
      return request<{ usage: TailorUsage }>(`/tailor/usage${qs}`);
    },
    saveStructured: (id: string, resume_draft: TailoredResume, selectedEvidenceIds: string[]) =>
      request<{ tailoring: StructuredTailoring }>(`/tailorings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ resume_draft, selectedEvidenceIds }),
      }),
    createArtifact: (id: string, data: {
      pdf: Blob;
      resume: TailoredResume;
      validation: TailoringValidation;
      typstSource: string;
      templateVersion: string;
      compilerVersion: string;
    }) => {
      const body = new FormData();
      body.set("pdf", data.pdf, "tailored-resume.pdf");
      body.set("resume_json", JSON.stringify(data.resume));
      body.set("validation_json", JSON.stringify(data.validation));
      body.set("typst_source", data.typstSource);
      body.set("template_version", data.templateVersion);
      body.set("compiler_version", data.compilerVersion);
      return request<{ artifact: TailoringArtifact }>(`/tailorings/${id}/artifacts`, {
        method: "POST",
        body,
      }, 60_000);
    },
  },
  runs: {
    list: (limit = 50) => request<{ runs: FetchRun[] }>(`/runs?limit=${limit}`),
  },
  ops: {
    refreshAll: (limit?: number) =>
      request<{ companiesPolled: number; newJobsFound: number; log: string[] }>(
        `/poll${limit ? `?limit=${limit}` : ""}`,
        { method: "POST" },
        120_000
      ),
  },
  interactions: {
    viewedJobs: () =>
      request<{ job_ids: string[] }>("/interactions/viewed-jobs"),
    markViewed: (jobId: string) =>
      request<void>(`/interactions/viewed-jobs/${jobId}`, { method: "POST" }),
    markUnviewed: (jobId: string) =>
      request<void>(`/interactions/viewed-jobs/${jobId}`, { method: "DELETE" }),
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
    jobReviews: (
      state: JobReview["state"] | "all" = "needs_review",
      limit = 100,
      offset = 0
    ) =>
      request<{
        reviews: JobReview[];
        meta: { total: number; count: number; has_more: boolean; next_offset: number };
      }>(
        `/interactions/job-reviews?state=${encodeURIComponent(state)}&limit=${limit}&offset=${offset}`
      ),
    updateJobReview: (
      jobId: string,
      data: { state: JobReview["state"]; admin_note?: string }
    ) =>
      request<{ ok: boolean; state: JobReview["state"] }>(
        `/interactions/job-reviews/${jobId}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
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
import type { SearchProfileV1 } from "../../../../shared/search-profile";
