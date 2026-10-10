import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { space } from "@pinkslip/tokens/native";

export type Gap = keyof typeof space;

interface LayoutProps extends Pick<ViewProps, "accessibilityRole" | "accessibilityLabel" | "testID"> {
  gap?: Gap;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  flex?: boolean;
  children: ReactNode;
}

const alignments = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;
const justifications = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;

function layout(direction: "column" | "row", { gap, align, justify, wrap, flex, children, ...rest }: LayoutProps) {
  return <View {...rest} style={{
    flexDirection: direction, gap: gap ? space[gap] : undefined, flexWrap: wrap ? "wrap" : undefined, flex: flex ? 1 : undefined,
    alignItems: align ? alignments[align] : direction === "row" ? "center" : undefined,
    justifyContent: justify ? justifications[justify] : undefined,
  }}>{children}</View>;
}

/** Vertical rhythm on the space scale. */
export const Stack = (props: LayoutProps) => layout("column", props);
/** A row, centered on the cross axis by default. */
export const Inline = (props: LayoutProps) => layout("row", props);
