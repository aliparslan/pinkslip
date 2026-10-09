import { describe, expect, test } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";
import { queryKeys } from "../src/keys";
import { createAppQueryClient, clearPersonalQueries } from "../src/query-client";

describe("app query client", () => {
  test("applies the shared defaults", () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.gcTime).toBe(600_000);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.mutations?.retry).toBe(0);
  });

  test("clears personal caches on owner change without touching public data", async () => {
    const client = createAppQueryClient();
    client.setQueryData(queryKeys.personal.saved(), { jobs: [] });
    client.setQueryData(queryKeys.personal.job("job-1"), { id: "job-1" });
    client.setQueryData(queryKeys.public.jobs(), { jobs: [] });
    client.setQueryData(queryKeys.session(), { state: "guest" });

    await clearPersonalQueries(client);

    expect(client.getQueryData(queryKeys.personal.saved())).toBeUndefined();
    expect(client.getQueryData(queryKeys.personal.job("job-1"))).toBeUndefined();
    expect(client.getQueryData(queryKeys.public.jobs())).toBeDefined();
    expect(client.getQueryData(queryKeys.session())).toBeDefined();
  });

  test("resets personal queries without orphaning mounted observers", async () => {
    const client = createAppQueryClient();
    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.personal.saved(),
      queryFn: async () => {
        fetches += 1;
        return { jobs: [] };
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.refetch();
    expect(fetches).toBe(1);

    await clearPersonalQueries(client);

    // A mounted observer keeps its cache entry and refetches for the new owner
    // instead of hanging pending forever.
    expect(client.getQueryCache().find({ queryKey: queryKeys.personal.saved() })).toBeDefined();
    expect(fetches).toBe(2);

    await observer.refetch();
    expect(fetches).toBe(3);
    expect(observer.getCurrentResult().status).toBe("success");
    unsubscribe();
  });
});
