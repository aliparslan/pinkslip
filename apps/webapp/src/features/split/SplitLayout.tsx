import { Outlet, useMatches, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Feed } from "../feed/Feed";
import { rememberedFeedSearch, rememberFeedSearch, type FeedSearch } from "../feed/criteria";
import { Library, type LibraryView } from "../library/Library";
import { SplitContext } from "../jobs/split";
import { useSessionAccess } from "../jobs/useJobActions";
import { SPLIT_QUERY, useMediaQuery } from "./media";
import { NeighboursContext, type Neighbours } from "./neighbours";
import styles from "./Split.module.css";

type Collection = "feed" | LibraryView;

const none = (): Neighbours => ({});
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * Jobs, Library and a job share this layout, so the list stays mounted while
 * jobs open beside it (the current app's shell kept the collection the same
 * way). Wide screens show the list and the job side by side, with "Select a
 * job" until one is open; phones show one at a time.
 *
 * The feed's filters live in the Jobs URL. While a job is open they're kept
 * here (and in memory for the Jobs tab), so the list beside it doesn't change.
 */
export function SplitLayout() {
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const jobId = useParams({ strict: false, select: (params) => params.jobId });
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const access = useSessionAccess();
  const wide = useMediaQuery(SPLIT_QUERY);
  const detail = routeId === "/_split/jobs/$jobId";
  const onFeed = routeId === "/_split/";

  const from = "from" in search ? search.from : undefined;
  const requested: Collection = routeId === "/_split/library/saved" || from === "library-saved" ? "saved"
    : routeId === "/_split/library/applied" || from === "library-applied" ? "applied" : "feed";
  // Library needs a session; a shared job link opened by a visitor lists Jobs.
  const collection: Collection = requested !== "feed" && detail && !access.personal ? "feed" : requested;

  const urlSearch = onFeed ? (search as FeedSearch) : undefined;
  const [kept, setKept] = useState<FeedSearch>(rememberedFeedSearch);
  const urlKey = urlSearch ? JSON.stringify(urlSearch) : null;
  const [seenKey, setSeenKey] = useState(urlKey);
  if (urlSearch && urlKey !== seenKey) {
    setSeenKey(urlKey);
    setKept(urlSearch);
  }
  const feedSearch = urlSearch ?? kept;
  useEffect(() => rememberFeedSearch(feedSearch), [feedSearch]);
  const setFeedSearch = useCallback((next: FeedSearch) => {
    if (onFeed) void navigate({ to: "/", search: next, replace: true, resetScroll: false });
    else setKept(next);
  }, [navigate, onFeed]);

  const [order, setOrder] = useState<readonly string[]>([]);
  const reportOrder = useCallback((ids: string[]) => setOrder((previous) => (same(previous, ids) ? previous : ids)), []);
  const neighbours = useCallback((id: string): Neighbours => {
    const index = order.indexOf(id);
    return index < 0 ? {} : { previous: order[index - 1], next: order[index + 1] };
  }, [order]);

  // Each job opens at its top; the list keeps its place.
  const detailPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (wide) detailPane.current?.scrollTo({ top: 0 });
  }, [jobId, wide]);

  let list: ReactNode = null;
  if (!detail || wide) {
    list = collection === "feed"
      ? <Feed search={feedSearch} onSearchChange={setFeedSearch} selectedId={jobId} onOrderChange={reportOrder} />
      : <Library view={collection} selectedId={jobId} onOrderChange={reportOrder} />;
  }

  return <SplitContext.Provider value={wide}>
    <div className={styles.root} data-detail={detail || undefined}>
      {list && <div className={styles.list}>{list}</div>}
      <div ref={detailPane} className={styles.detail}
        tabIndex={detail && wide ? -1 : undefined} data-route-focus={detail && wide ? true : undefined}>
        <NeighboursContext.Provider value={wide ? neighbours : none}>
          <Outlet />
        </NeighboursContext.Provider>
      </div>
    </div>
  </SplitContext.Provider>;
}
