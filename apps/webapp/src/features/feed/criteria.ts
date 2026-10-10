export * from "@pinkslip/core/feed-criteria";
import type { FeedSearch } from "@pinkslip/core/feed-criteria";

let lastFeedSearch: FeedSearch = {};

/** The feed's filters stay put while a job is open, and the Jobs tab returns
 * to them, the way the current app's feed store kept them. */
export const rememberFeedSearch = (search: FeedSearch) => { lastFeedSearch = search; };
export const rememberedFeedSearch = (): FeedSearch => lastFeedSearch;
