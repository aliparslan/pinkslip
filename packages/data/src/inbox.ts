import type { ForwardingProvider, ForwardingScope, InboundEmailStatus } from "@pinkslip/core/api";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/* Email tracking (docs/email-tracking.md): the user's forwarding address and
   the emails it detected. Answers change applications, so those refresh too. */

/** `poll` refetches every few seconds: setup waits on Gmail's code this way.
 * Guests have no inbox, so callers that guests reach pass `enabled`. */
export function useInbox({ poll = false, enabled = true }: { poll?: boolean; enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.inbox(), queryFn: () => api.inbox.get(), refetchInterval: poll ? 4000 : false, enabled });
}

export function useInboxEmails(status?: InboundEmailStatus, { enabled = true }: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.inboxEmails(status),
    queryFn: async () => (await api.inbox.emails(status)).emails,
    enabled,
  });
}

export function useRotateInbox() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.inbox.rotate(),
    onSuccess: (inbox) => queryClient.setQueryData(queryKeys.personal.inbox(), inbox),
  });
}

/** "Email me these steps". */
export function useSendForwardingSteps() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ provider, scope }: { provider: ForwardingProvider; scope?: ForwardingScope }) => api.inbox.stepsEmail(provider, scope),
  });
}

function refreshAfterAnswer(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.inbox() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.today() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applicationsRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.saved() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applied() });
}

/** "Which application?": the user's answer, one application or several. */
export function useAssignInboundEmail() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ emailId, applicationIds }: { emailId: string; applicationIds: string[] }) => api.inbox.assign(emailId, applicationIds),
    onSettled: () => refreshAfterAnswer(queryClient),
  });
}

/** "Not one of these". */
export function useDismissInboundEmail() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => api.inbox.dismiss(emailId),
    onSettled: () => refreshAfterAnswer(queryClient),
  });
}

/** "Not right?": removes the step an email recorded, on one application
 * when it's given. */
export function useUndoInboundEmail() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ emailId, applicationId }: { emailId: string; applicationId?: string }) => api.inbox.undo(emailId, applicationId),
    onSettled: () => refreshAfterAnswer(queryClient),
  });
}
