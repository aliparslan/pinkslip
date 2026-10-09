import { describe, expect, test } from "bun:test";
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
});
