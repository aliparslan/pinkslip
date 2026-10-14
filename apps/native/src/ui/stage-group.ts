/** Where an application stands, as Tracker groups it: the endings share Closed. */
export type StageGroup = "saved" | "applied" | "assessment" | "interview" | "offer" | "closed";

/** What a stage mark can show: Tracker's groups, and each ending on its own
 * (the Change stage sheet, an application's stub). */
export type StageMarkKind = StageGroup | "rejected" | "withdrawn" | "ghosted";
