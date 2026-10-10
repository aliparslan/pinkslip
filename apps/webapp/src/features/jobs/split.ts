import { createContext, useContext } from "react";

/** True while a job list and a job sit side by side (wide screens). Rows then
 * keep the window's scroll when opening a job, since the list stays visible. */
export const SplitContext = createContext(false);

export const useSplit = () => useContext(SplitContext);
