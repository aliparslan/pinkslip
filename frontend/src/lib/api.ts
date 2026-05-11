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

async function requestBinary(path: string, options?: RequestInit): Promise<Uint8Array> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);
    const data = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : undefined;
    const message = typeof data?.error === "string" ? data.error : `API error: ${res.status}`;
    const code = typeof data?.code === "string" ? data.code : undefined;
    throw new ApiError(message, res.status, code, payload);
  }

  return new Uint8Array(await res.arrayBuffer());
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
  created_at: string;
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
  },
  preferences: {
    get: () => request<Record<string, unknown>>("/preferences"),
    update: (prefs: Record<string, unknown>) =>
      request<Record<string, unknown>>("/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
  },
  push: {
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
    test: (delay = 0) =>
      request<{ sent: number; total: number }>(`/push/test${delay ? `?delay=${delay}` : ""}`, {
        method: "POST",
      }),
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
    get: () => request<{ user: User | null; features?: AppFeatures }>("/me"),
    update: (data: { name: string }) =>
      request<{ user: User }>("/me", {
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
  corpus: {
    get: () =>
      request<{ content_md: string; version_id: number | null; updated_at: string | null; label?: string | null }>("/corpus"),
    update: (content_md: string) =>
      request<{ content_md: string; version_id: number | null; updated_at: string | null; label?: string | null }>("/corpus", {
        method: "PUT",
        body: JSON.stringify({ content_md }),
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
    renderPdf: (source: string, fileName: string, format: "latex" | "typst" = "latex") =>
      requestBinary("/tailor/render", {
        method: "POST",
        body: JSON.stringify({ source, format, file_name: fileName }),
      }),
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
};
