import { ApiError, SEND_IN_PROGRESS, type ApplySend } from "@pinkslip/core/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** While a send is going it's asked about every few seconds. */
const POLL_MS = 3_000;

/** Auto-apply's sends, newest first, with how each went. */
export function useApplySends(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.sends(),
    queryFn: async () => (await api.apply.sends()).sends,
    enabled,
    refetchInterval: (query) => (query.state.data?.some((send) => SEND_IN_PROGRESS.has(send.status)) ? POLL_MS : false),
  });
}

/** One send, followed until it ends. */
export function useApplySend(sendId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.send(sendId),
    queryFn: () => api.apply.send(sendId),
    enabled,
    refetchInterval: (query) => (query.state.data && SEND_IN_PROGRESS.has(query.state.data.status) ? POLL_MS : false),
  });
}

function useRememberSend() {
  const queryClient = useQueryClient();
  return (send: ApplySend | null) => {
    if (send) queryClient.setQueryData(queryKeys.personal.send(send.id), send);
    void queryClient.invalidateQueries({ queryKey: queryKeys.personal.sends() });
  };
}

/** Pinkslip applies to a job; a dry run stops before Submit. */
export function useStartSend() {
  const api = useApi();
  const remember = useRememberSend();
  return useMutation({
    mutationFn: ({ jobId, dryRun = false }: { jobId: string; dryRun?: boolean }) => api.apply.startSend(jobId, dryRun),
    onSuccess: remember,
  });
}

/** Answers what a send stopped on and starts it again; the answers are kept
 * for every later form. */
export function useAnswerSend() {
  const api = useApi();
  const queryClient = useQueryClient();
  const remember = useRememberSend();
  return useMutation({
    mutationFn: ({ sendId, answers, resend = true }: { sendId: string; answers: Record<string, string | string[]>; resend?: boolean }) =>
      api.apply.answerSend(sendId, answers, resend),
    onSuccess: ({ send }) => {
      remember(send);
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.answers() });
    },
  });
}

/** The code Greenhouse emailed, when forwarding didn't bring it. */
export function useSendCode() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sendId, code }: { sendId: string; code: string }) => api.apply.sendCode(sendId, code),
    onSuccess: (_, { sendId }) => void queryClient.invalidateQueries({ queryKey: queryKeys.personal.send(sendId) }),
  });
}

/** The resume sends upload; null until there is one. */
export function useSendResume(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.sendResume(),
    queryFn: () => api.apply.sendResume().catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    enabled,
  });
}

export function useUploadSendResume() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pdf, name }: { pdf: Blob | ArrayBuffer; name: string }) => api.apply.uploadSendResume(pdf, name),
    onSuccess: (info) => queryClient.setQueryData(queryKeys.personal.sendResume(), info),
  });
}
