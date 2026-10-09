# @pinkslip/data

TanStack Query definitions and session coordination shared by the React web app
and (from Phase 6) the Expo app. React hooks and context only — no DOM, no
browser storage, no navigation. The API transport comes from `@pinkslip/core`'s
`createApiClient`; apps provide the per-request or per-shell instance.

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { DataProvider, createAppQueryClient, usePublicJobs } from "@pinkslip/data";

const queryClient = createAppQueryClient();
function App({ api }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider api={api}>
        <Jobs />
      </DataProvider>
    </QueryClientProvider>
  );
}
```

## Ownership

- **Keys.** `queryKeys.public.*` never carries owner state; every personal key
  lives under `queryKeys.personal.root`, so `clearPersonalQueries(queryClient)`
  cancels and removes them in one pass when the owner changes.
- **Session.** `sessionQueryOptions` reads `GET /me`; a 401 is a valid
  anonymous session, not a load error. `useOwnerChangeCleanup()` clears personal
  caches when a later session load reports a different user.
- **Optimistic updates.** `setJobSaved` / `setJobApplied` patch the detail and
  list caches and return a rollback; the mutation hooks capture it in `onMutate`
  and restore it on error. Mutation success replaces the optimistic entry with
  the server's job.
- **SSR.** One QueryClient per request. Serve`queryClient.ensureQueryData` in a
  loader, then read it with `useSuspenseQuery`; the web router dehydrates the
  cache through `@tanstack/react-router-ssr-query`.

Profile, preferences, alerts, companies, resume, answers, apply, outreach and
admin hooks arrive with their Phase 4 feature slices.
