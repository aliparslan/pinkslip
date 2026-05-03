const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
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
  saved?: boolean;
}

export interface Company {
  id: string;
  name: string;
  ats_type: string;
  ats_slug: string;
  website: string;
  enabled: boolean;
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

export const api = {
  jobs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ jobs: Job[]; meta: { total: number } }>(`/jobs${qs}`);
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
    }) =>
      request<Company>("/companies", {
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
    create: (data: { job_id?: string; company_name: string; title: string; stage?: string; url?: string }) =>
      request<Application>("/applications", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { stage?: string; next?: string; url?: string }) =>
      request<Application>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/applications/${id}`, { method: "DELETE" }),
  },
  events: {
    list: (params?: { company_id?: string; upcoming?: boolean }) => {
      const qs = params ? "?" + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
      ).toString() : "";
      return request<{ events: Record<string, unknown>[] }>(`/events${qs}`);
    },
    create: (data: { company_id?: string; title: string; description?: string; event_type?: string; event_date: string; location?: string; url?: string }) =>
      request<Record<string, unknown>>("/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/events/${id}`, { method: "DELETE" }),
  },
  me: {
    get: () => request<{ user: User }>("/me"),
    update: (data: { name: string }) =>
      request<{ user: User }>("/me", {
        method: "PATCH",
        body: JSON.stringify(data),
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
};
