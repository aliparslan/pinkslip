import type { ApiClient, ApplicationAnswerValue, PreparedApplication } from "@pinkslip/core/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

type OutreachThread = Awaited<ReturnType<ApiClient["outreach"]["get"]>>;

/** The employer's application form with every answer Pinkslip already has
 * (resume, saved answers, job preferences). Auto-apply only. */
export function usePreparedApplication(jobId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.prepared(jobId),
    queryFn: () => api.apply.prepare(jobId),
    enabled,
    staleTime: 0,
    gcTime: 60_000,
  });
}

/** Answers one question on the form; the server returns the whole form again
 * and remembers the answer for later applications. */
export function useAnswerPreparedField(jobId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: ApplicationAnswerValue | null }) =>
      api.apply.saveAnswers(jobId, { [fieldId]: value }),
    onSuccess: (prepared: PreparedApplication) => {
      queryClient.setQueryData(queryKeys.personal.prepared(jobId), prepared);
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.answers() });
    },
  });
}

/** The recruiter email thread for a job: the one a reminder links to, the
 * job's existing thread, or a new draft. */
export function useOutreachThread(jobId: string, threadId: string | null, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.outreach(jobId, threadId),
    queryFn: async () => {
      if (threadId) return api.outreach.get(threadId);
      const { threads } = await api.outreach.list(jobId);
      return threads[0] ?? api.outreach.start(jobId);
    },
    enabled,
    retry: false,
    staleTime: 0,
  });
}

type OutreachAction =
  | { kind: "edit"; messageId: string; subject: string; body: string }
  | { kind: "sent"; messageId: string; timeZone: string }
  | { kind: "replied" | "stop"; threadId: string }
  | { kind: "discard"; threadId: string };

export function useOutreachAction(jobId: string, threadId: string | null) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: OutreachAction): Promise<OutreachThread | null> => {
      switch (action.kind) {
        case "edit": return api.outreach.edit(action.messageId, { subject: action.subject, body: action.body });
        case "sent": return api.outreach.markSent(action.messageId, action.timeZone);
        case "replied": return api.outreach.markReplied(action.threadId);
        case "stop": return api.outreach.stop(action.threadId);
        case "discard": await api.outreach.discard(action.threadId); return null;
      }
    },
    onSuccess: (thread) => {
      const key = queryKeys.personal.outreach(jobId, threadId);
      if (thread) queryClient.setQueryData(key, thread);
      else queryClient.removeQueries({ queryKey: key });
    },
  });
}

/** Every recruiter thread you've started, for Today's follow-ups, Tracker's
 * rows and a company's people. */
export function useOutreachThreads(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.personal.outreachAll(),
    queryFn: async () => (await api.outreach.list()).threads,
    enabled,
  });
}

/** One thread, by id: a person's page. */
export function useOutreachThreadById(threadId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.outreachById(threadId), queryFn: () => api.outreach.get(threadId), enabled });
}

/** Starts the thread for a job, or finds the one already there. */
export function useStartOutreach() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { threads } = await api.outreach.list(jobId);
      return threads[0] ?? api.outreach.start(jobId);
    },
    onSuccess: (thread) => {
      queryClient.setQueryData(queryKeys.personal.outreachById(thread.id), thread);
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.outreachAll() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.today() });
    },
  });
}

/** Sent, replied, stop the follow-ups: by thread, for a person's page. */
export function useOutreachUpdate() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: Exclude<OutreachAction, { kind: "edit" } | { kind: "discard" }>): Promise<OutreachThread> => {
      switch (action.kind) {
        case "sent": return api.outreach.markSent(action.messageId, action.timeZone);
        case "replied": return api.outreach.markReplied(action.threadId);
        case "stop": return api.outreach.stop(action.threadId);
      }
    },
    onSuccess: (thread) => {
      queryClient.setQueryData(queryKeys.personal.outreachById(thread.id), thread);
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.outreachAll() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.today() });
    },
  });
}
