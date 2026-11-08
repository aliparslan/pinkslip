import { LinkZoomTransitionSource } from "expo-router/build/link/preview/native";
import { Slot } from "expo-router/build/ui/Slot";
import type { ComponentProps } from "react";
import { ZOOM_SOURCE } from "../../platform/links";

type SlotProps = Omit<ComponentProps<typeof Slot>, "id">;

/** What a row's link carries so its page grows out of the row. */
export function zoomParams(id: string) {
  return { [ZOOM_SOURCE]: id };
}

/**
 * The row a page zooms out of and back into, in place of `withAppleZoom`.
 * That one goes by an id made when the row is tapped; an alert has to name
 * the row before the list has even loaded, so here the id comes from what
 * the row shows (`rowZoomId`) and a tap and an alert land the same (owner,
 * Nov 8). Off the list, iOS shrinks the page into the middle of the screen.
 */
export function RowZoom({ id, children, ...rest }: SlotProps & { id: string }) {
  return <LinkZoomTransitionSource identifier={id} animateAspectRatioChange><Slot {...rest}>{children}</Slot></LinkZoomTransitionSource>;
}

/** `RowZoom`, or just the row when there's no zoom to give it. */
export function Zoomed({ id, children, ...rest }: SlotProps & { id: string | null }) {
  return id ? <RowZoom id={id} {...rest}>{children}</RowZoom> : <Slot {...rest}>{children}</Slot>;
}
