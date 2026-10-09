import type { ApiClient } from "@pinkslip/core/api";
import { createContext, useContext, type ReactNode } from "react";

const DataContext = createContext<ApiClient | null>(null);

/** Provides the per-app (or per-request) API client. Native apps compose it
 * with QueryClientProvider; the web router's SSR integration owns that wrapper. */
export function DataProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(DataContext);
  if (!api) throw new Error("useApi must be used inside DataProvider");
  return api;
}
