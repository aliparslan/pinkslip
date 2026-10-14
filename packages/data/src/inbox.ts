import type { InboundEmailStatus } from "@pinkslip/core/api";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/* Email tracking (docs/email-tracking.md): the user's forwarding address and
   the emails it detected. Answers change applications, so those refresh too. */

export function useInbox() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.inbox(), queryFn: () => api.inbox.get() });
}

export function useInboxEmails(status?: InboundEmailStatus) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.inboxEmails(status),
    queryFn: async () => (await api.inbox.emails(status)).emails,
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

function refreshAfterAnswer(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.inbox() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applicationsRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.saved() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applied() });
}

/** "Which application?": the user's answer. */
export function useAssignInboundEmail() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ emailId, applicationId }: { emailId: string; applicationId: string }) => api.inbox.assign(emailId, applicationId),
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

/** "Not right?": removes the step an email recorded. */
export function useUndoInboundEmail() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => api.inbox.undo(emailId),
    onSettled: () => refreshAfterAnswer(queryClient),
  });
}
