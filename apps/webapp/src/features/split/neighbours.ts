import { createContext, useContext } from "react";

export interface Neighbours {
  previous?: string;
  next?: string;
}

/** The ids of the jobs above and below the open one in the list beside it.
 * Empty when no list is showing (phones). */
export const NeighboursContext = createContext<(id: string) => Neighbours>(() => ({}));

export const useNeighbours = (id: string) => useContext(NeighboursContext)(id);
