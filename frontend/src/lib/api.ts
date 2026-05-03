const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  jobs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ jobs: any[]; meta: any }>(`/jobs${qs}`);
    },
    get: (id: string) => request<any>(`/jobs/${id}`),
    dismiss: (id: string) =>
      request<any>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed: true }),
      }),
    undismiss: (id: string) =>
      request<any>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed: false }),
      }),
  },
  companies: {
    list: (atsType?: string) => {
      const qs = atsType ? `?ats_type=${atsType}` : "";
      return request<{ companies: any[] }>(`/companies${qs}`);
    },
    toggle: (id: string, enabled: boolean) =>
      request<any>(`/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    delete: (id: string) =>
      request<any>(`/companies/${id}`, { method: "DELETE" }),
    create: (data: {
      name: string;
      ats_type: string;
      ats_slug: string;
    }) =>
      request<any>("/companies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  preferences: {
    get: () => request<Record<string, any>>("/preferences"),
    update: (prefs: Record<string, any>) =>
      request<any>("/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
  },
  push: {
    subscribe: (subscription: PushSubscription) =>
      request<any>("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      }),
    unsubscribe: (endpoint: string) =>
      request<any>("/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }),
  },
  stats: {
    get: () =>
      request<{
        totalJobs: number;
        newToday: number;
        activeCompanies: number;
      }>("/stats"),
  },
};
