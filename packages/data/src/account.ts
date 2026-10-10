import type { ApiClient, FeedbackSubmission, MeResponse, PreferenceState } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";
import { clearPersonalQueries } from "./query-client";
import type { Session } from "./session";

const sessionFrom = (me: MeResponse): Session => ({ state: me.session.state, me });

/** Saves the search profile. The feed refetches, since its matches change;
 * the saved (normalized) profile replaces the cached one. */
export function useUpdatePreferences() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: Partial<PreferenceState>) => api.preferences.update(state),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.personal.preferences(), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot });
      // A visitor's first save starts a guest session.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session() });
    },
  });
}

/** The account-wide alert switch and the server's web push key. */
export const pushSettingsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.push(),
    queryFn: () => api.push.settings(),
  });

export function usePushSettings(enabled = true) {
  return useQuery({ ...pushSettingsQueryOptions(useApi()), enabled });
}

export function useUpdatePushSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.push.updateSettings({ enabled, push_enabled: true }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.personal.push(), (previous: Awaited<ReturnType<ApiClient["push"]["settings"]>> | undefined) =>
        previous ? { ...previous, ...saved } : previous);
    },
  });
}

/** The structured resume, for readiness summaries. */
export const resumeProfileQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.resume(),
    queryFn: () => api.profile.get(),
  });

export function useResumeProfile(enabled = true) {
  return useQuery({ ...resumeProfileQueryOptions(useApi()), enabled });
}

/** Display name. The session carries it, so it updates in place. */
export function useUpdateName() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.me.update({ name }),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.session(), sessionFrom(me)),
  });
}

export function useStartEmailLogin() {
  const api = useApi();
  return useMutation({ mutationFn: (email: string) => api.auth.startEmailLogin(email) });
}

/** Deletes the account and adopts the guest session the server returns. */
export function useDeleteAccount() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.deleteAccount(),
    onSuccess: async (response) => {
      queryClient.setQueryData(queryKeys.session(), sessionFrom(response));
      await clearPersonalQueries(queryClient);
    },
  });
}

export function useSubmitFeedback() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: { type: FeedbackSubmission["submission_type"]; title: string; details: string }) =>
      api.interactions.submitFeedback({ submission_type: input.type, title: input.title, details: input.details || undefined }),
  });
}
