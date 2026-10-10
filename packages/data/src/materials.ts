import type { ApiClient, ApplicationAnswerValue, ResumeProfile, SavedApplicationAnswer } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

type ResumeRecord = Awaited<ReturnType<ApiClient["profile"]["get"]>>;

/** Saves the whole structured resume and adopts the server's copy. */
export function useSaveResume() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: ResumeProfile) => api.profile.update(profile),
    onSuccess: (saved) => queryClient.setQueryData<ResumeRecord>(queryKeys.personal.resume(), saved),
  });
}

export const answersQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.personal.answers(),
    queryFn: async () => (await api.apply.answers()).answers,
  });

export function useAnswers(enabled = true) {
  return useQuery({ ...answersQueryOptions(useApi()), enabled });
}

type Answers = SavedApplicationAnswer[];

function place(answers: Answers, answer: SavedApplicationAnswer, index = 0): Answers {
  const at = answers.findIndex((candidate) => candidate.key === answer.key);
  if (at >= 0) return answers.map((candidate) => (candidate.key === answer.key ? answer : candidate));
  const next = [...answers];
  next.splice(Math.min(index, next.length), 0, answer);
  return next;
}

/** Sets one answer, optimistically; a failure restores the previous one. */
export function useSetAnswer() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.personal.answers();
  return useMutation({
    mutationFn: (input: { key: string; value: ApplicationAnswerValue; label?: string; index?: number }) =>
      api.apply.setAnswer(input.key, input.value, input.label),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Answers>(key);
      const old = previous?.find((answer) => answer.key === input.key);
      queryClient.setQueryData<Answers>(key, (answers = []) => place(answers, {
        key: input.key, value: input.value, label: input.label ?? old?.label ?? "", updated_at: new Date().toISOString(),
      }, input.index));
      return () => queryClient.setQueryData(key, previous);
    },
    onError: (_error, _input, rollback) => rollback?.(),
    onSuccess: (saved) => queryClient.setQueryData<Answers>(key, (answers = []) => place(answers, saved)),
  });
}

export function useDeleteAnswer() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.personal.answers();
  return useMutation({
    mutationFn: (answerKey: string) => api.apply.deleteAnswer(answerKey),
    onMutate: async (answerKey) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Answers>(key);
      queryClient.setQueryData<Answers>(key, (answers = []) => answers.filter((answer) => answer.key !== answerKey));
      return () => queryClient.setQueryData(key, previous);
    },
    onError: (_error, _key, rollback) => rollback?.(),
  });
}
