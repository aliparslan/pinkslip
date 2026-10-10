/**
 * Visitors without a session read the feed as this built-in account. It has
 * a new guest's default search profile, so a visitor sees exactly what a
 * fresh guest would, with search, filters and paging, and no per-visitor
 * user or session is created until they make a change (saving a job).
 * Only the feed list reads as it (`authMiddleware`); it never writes.
 */
export const CATALOG_READER_ID = "catalog-reader";
