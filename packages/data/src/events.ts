import type { CompanyEvent } from "@pinkslip/core/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** A company's events still on its page, soonest first. */
export function useCompanyEvents(companyId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.companyEvents(companyId),
    queryFn: async () => (await api.companies.events(companyId)).events,
    enabled: enabled && Boolean(companyId),
    staleTime: 60_000,
  });
}

/** One event, seeded from a list it was opened from. */
export function useEvent(id: string, initial?: CompanyEvent) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.event(id),
    queryFn: () => api.events.get(id),
    enabled: Boolean(id),
    initialData: initial,
    staleTime: 60_000,
  });
}

/** Remind me (N19), on or off. Optimistic on the event and its company's list;
 * Today refetches, since a reminded event joins Coming up. */
export function useSetEventReminder() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ event, on }: { event: CompanyEvent; on: boolean }) => on ? api.events.remind(event.id) : api.events.unremind(event.id),
    onMutate: async ({ event, on }) => {
      const detail = queryKeys.personal.event(event.id);
      const list = queryKeys.personal.companyEvents(event.company_id);
      await Promise.all([queryClient.cancelQueries({ queryKey: detail }), queryClient.cancelQueries({ queryKey: list })]);
      const previous = { detail: queryClient.getQueryData<CompanyEvent>(detail), list: queryClient.getQueryData<CompanyEvent[]>(list) };
      queryClient.setQueryData<CompanyEvent>(detail, (current) => ({ ...(current ?? event), reminded: on }));
      queryClient.setQueryData<CompanyEvent[]>(list, (events) => events?.map((item) => item.id === event.id ? { ...item, reminded: on } : item));
      return () => {
        queryClient.setQueryData(detail, previous.detail);
        queryClient.setQueryData(list, previous.list);
      };
    },
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.personal.today() }),
  });
}
