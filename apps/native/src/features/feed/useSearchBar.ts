import { useRef } from "react";
import { feedSearch, setFeedSearch } from "./feed-search";

const SEARCH_DEBOUNCE_MS = 250;

/** The navigation bar's search field for the feed: typing commits after a
 * short pause, Search commits at once, Cancel clears. */
export function useSearchBar() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (text: string) => {
    const next = { ...feedSearch() };
    if (text.trim()) next.q = text;
    else delete next.q;
    if ((next.q ?? "") !== (feedSearch().q ?? "")) setFeedSearch(next);
  };
  return {
    onChangeText: (event: { nativeEvent: { text: string } }) => {
      const text = event.nativeEvent.text;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(text), SEARCH_DEBOUNCE_MS);
    },
    onSearchButtonPress: (event: { nativeEvent: { text: string } }) => commit(event.nativeEvent.text),
    onCancelButtonPress: () => commit(""),
  };
}
