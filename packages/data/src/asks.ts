import type { ApplyAskAction, AutoApplyMode, AutoApplyPause, AutoApplySettings } from "@pinkslip/core/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** How a strong match is handled as it posts (Ask me, Apply for me, off) and Pause. */
export function useAutoApplySettings(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.autoApplySettings(), queryFn: () => api.apply.autoApplySettings(), enabled });
}

/** Changes the mode, pauses, or resumes (`pause: null`). */
export function useSaveAutoApplySettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode?: AutoApplyMode; pause?: AutoApplyPause | null }) => api.apply.saveAutoApplySettings(input),
    onSuccess: (settings: AutoApplySettings) => queryClient.setQueryData(queryKeys.personal.autoApplySettings(), settings),
  });
}

/** The "Apply for you?" push's buttons: Apply starts the send, Not this one dismisses the job. */
export function useAnswerAsk() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: ApplyAskAction }) => api.apply.answerAsk(jobId, action),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.personal.sends() }),
  });
}
