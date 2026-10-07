import { clsx, type ClassValue } from "clsx";
import * as React from "react";

export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

type StateClassName<State> = string | ((state: State) => string | undefined) | undefined;

/** Base UI accepts className as a string or as a function of component state.
 * Merge Pinkslip's base classes with either form. */
export function mergeClassName<State>(base: string, className: StateClassName<State>) {
  if (typeof className === "function") {
    return (state: State) => cn(base, className(state));
  }
  return cn(base, className);
}

/** Wrap a Base UI part with Pinkslip's base classes while keeping its full API. */
export function styled<C extends React.ElementType>(Component: C, base: string, displayName?: string) {
  function Styled(props: React.ComponentProps<C>) {
    const { className, ...rest } = props as { className?: StateClassName<unknown> };
    return React.createElement(Component, {
      ...rest,
      className: mergeClassName(base, className),
    } as React.ComponentProps<C>);
  }
  Styled.displayName = displayName ?? "Styled";
  return Styled;
}
