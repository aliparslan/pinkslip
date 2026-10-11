import { useCallback, useState } from "react";

/** A refresh control that spins only for the user's own pull. Background
 * refetches (launch, returning to the app) stay quiet: a refresh control set
 * spinning from code pushes the large title down onto the search field. */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}
