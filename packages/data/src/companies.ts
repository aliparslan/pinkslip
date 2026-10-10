import type { ApiClient, Company } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

type PollableCompanySourceType = Parameters<ApiClient["companies"]["create"]>[0]["ats_type"];

/** Every company source with this account's hidden flag. The same list backs
 * the user's Companies screen and the admin Sources screen. */
export const companiesQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.companies(),
    queryFn: async () => (await api.companies.list()).companies ?? [],
    staleTime: 60_000,
  });

export function useCompanies(enabled = true) {
  return useQuery({ ...companiesQueryOptions(useApi()), enabled });
}

type Companies = Company[];

/** Patches one company in the cached list; returns the rollback. */
function patchCompany(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Company>) {
  const key = queryKeys.personal.companies();
  const previous = queryClient.getQueryData<Companies>(key);
  queryClient.setQueryData<Companies>(key, (companies) =>
    companies?.map((company) => (company.id === id ? { ...company, ...patch } : company)));
  return () => queryClient.setQueryData(key, previous);
}

/** Hide or restore a company's jobs for this account. Optimistic; the job
 * lists refetch once it lands. */
export function useSetCompanyHidden() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      hidden ? api.companies.block(id) : api.companies.restore(id),
    onMutate: async ({ id, hidden }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.companies() });
      return patchCompany(queryClient, id, { blocked: hidden });
    },
    onError: (_error, _input, rollback) => rollback?.(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot }),
  });
}

export function useReportCompany() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: { companyId: string; notes: string }) =>
      api.interactions.report({ company_id: input.companyId, report_type: "broken_source", notes: input.notes }),
  });
}

export function useRequestCompany() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: { name: string; careersUrl: string; details: string }) =>
      api.interactions.submitFeedback({
        submission_type: "company_request",
        title: input.name,
        careers_url: input.careersUrl || undefined,
        details: input.details || undefined,
      }),
  });
}

/* Admin source management. */

export function useToggleCompany() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.companies.toggle(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.personal.companies() });
      return patchCompany(queryClient, id, { enabled });
    },
    onError: (_error, _input, rollback) => rollback?.(),
  });
}

export function useCreateCompany() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; ats_type: PollableCompanySourceType; ats_slug: string; website?: string }) =>
      api.companies.create(input),
    onSuccess: (created) => queryClient.setQueryData<Companies>(queryKeys.personal.companies(), (companies = []) =>
      [...companies, created].sort((a, b) => a.name.localeCompare(b.name))),
  });
}

/** Saves a source's name and ATS, then polls it once so the admin sees
 * whether the fix worked. */
export function useUpdateCompany() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; ats_type: PollableCompanySourceType; ats_slug: string }) =>
      api.companies.update(id, data),
    onSuccess: (updated) => patchCompany(queryClient, updated.id, updated),
  });
}

export function usePollCompany() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.companies.poll(id),
    onSuccess: (result, id) => patchCompany(queryClient, id, result),
  });
}

export function useDeleteCompany() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.companies.delete(id),
    onSuccess: (_result, id) => queryClient.setQueryData<Companies>(queryKeys.personal.companies(), (companies) =>
      companies?.filter((company) => company.id !== id)),
  });
}

export function useVerifySource() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: { ats_type: PollableCompanySourceType; ats_slug: string }) => api.companies.verify(input),
  });
}
