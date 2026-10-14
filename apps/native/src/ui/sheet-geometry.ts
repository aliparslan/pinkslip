import { ui } from "@pinkslip/tokens/native";
import { concentricRadius } from "./screen-corners";

/** The gap between a sheet and the screen's edges. */
export const SHEET_INSET = 8;
export const SHEET_RADIUS = 40;
/** The bottom corners run parallel to the screen's own, 8 in from them. */
export const SHEET_BOTTOM_RADIUS = concentricRadius(SHEET_INSET, SHEET_RADIUS);
/** A step's padding at the sides and bottom. */
export const SHEET_PADDING = ui.space["5"];

/** A group inside a sheet runs parallel to the sheet's corners, its padding
 * in from them; the last group's bottom corners follow the sheet's bottom
 * (owner, 2026-10-14). On a plain page groups stay 12. */
export const SHEET_GROUP_RADIUS = SHEET_RADIUS - SHEET_PADDING;
export const SHEET_GROUP_BOTTOM_RADIUS = SHEET_BOTTOM_RADIUS - SHEET_PADDING;
