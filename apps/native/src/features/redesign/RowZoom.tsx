import { LinkZoomTransitionSource } from "expo-router/build/link/preview/native";
import { Slot } from "expo-router/build/ui/Slot";
import { useState, type ComponentProps } from "react";
import { Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ZOOM_SOURCE } from "../../platform/links";
import { useMotionTrial } from "../../ui/motion-trial";
import { PAGE_BAR } from "../../ui/PageBar";

type SlotProps = Omit<ComponentProps<typeof Slot>, "id">;

/** What a row's link carries so its page grows out of the row. */
/**
 * Where a page meets its row in a zoom, under the page's bar: its logo and
 * title land on the row's, instead of the page's top landing there and the
 * title falling a row too low. The page has the company above the title and
 * the row has it below, so this splits the difference between the two.
 */
const UNDER_BAR = 16;

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
  const lands = useMotionTrial("zoomLanding");
  const top = useSafeAreaInsets().top;
  const [height, setHeight] = useState(0);
  // Exactly the row's shape, so the page keeps its size and iOS doesn't
  // enlarge it to fit. The row names it, not the page: Back takes the page
  // away before iOS asks, and a scrolled page would have moved it.
  const alignment = lands && height > 0 ? { x: 0, y: top + PAGE_BAR + UNDER_BAR, width: Dimensions.get("window").width, height } : undefined;
  return <LinkZoomTransitionSource identifier={id} animateAspectRatioChange alignment={alignment}>
    <Slot {...rest} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>{children}</Slot>
  </LinkZoomTransitionSource>;
}

/** `RowZoom`, or just the row when there's no zoom to give it. */
export function Zoomed({ id, children, ...rest }: SlotProps & { id: string | null }) {
  return id ? <RowZoom id={id} {...rest}>{children}</RowZoom> : <Slot {...rest}>{children}</Slot>;
}
