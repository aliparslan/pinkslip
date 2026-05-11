import { mock } from "bun:test";

export function stubFetchResolved(value: unknown) {
  const fetchMock = mock().mockResolvedValue(value);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export function stubFetchRejected(error: unknown) {
  const fetchMock = mock().mockRejectedValue(error);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
