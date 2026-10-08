import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { useLayoutEffect, useRef } from "react";
import { cn, mergeClassName, styled } from "./lib/cn";

export type ToggleSize = "md" | "lg" | "icon" | "icon-sm";

const toggleSizes: Record<ToggleSize, string> = {
  md: "h-control rounded-control px-3 text-ui",
  lg: "h-control-lg rounded-control px-4 text-body",
  icon: "size-control rounded-control text-ui",
  "icon-sm": "size-control-sm rounded-inset text-meta",
};

/** A pressed/unpressed action, such as Save. Flat by default, for toolbars
 * and rows. `raised` paints it like the secondary button, for a toggle that
 * sits in a row of buttons; pressing it in sinks it. */
export function Toggle({
  size = "md",
  raised = false,
  className,
  ...props
}: BaseToggle.Props & { size?: ToggleSize; raised?: boolean }) {
  return (
    <BaseToggle
      {...props}
      className={mergeClassName(
        cn(
          raised ? "ps-btn ps-btn--secondary" : "ps-toggle",
          "ps-press inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 font-medium focus-ring data-[disabled]:opacity-45",
          toggleSizes[size],
        ),
        className,
      )}
    />
  );
}

/** A choice chip: a pill that turns on and off, as in filters and the search
 * sheet. Medium height and type, so it lines up with a medium field or
 * button. Popover triggers that open a filter use the same class, with
 * data-pressed set while the filter is on. */
export const chipClass =
  "ps-choice ps-press inline-flex h-control shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-pill px-3.5 text-ui font-medium focus-ring data-[disabled]:opacity-45";

export const Chip = styled(BaseToggle, chipClass, "Chip");

/** Segmented control: one choice among a few, shown side by side. The
 * selection slides to the pressed segment. Single selection only. */
export function Segmented({ className, children, ...props }: BaseToggleGroup.Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let ready = false;
    const measure = () => {
      const active = root.querySelector<HTMLElement>(":scope > [data-pressed]");
      if (!active) {
        root.style.setProperty("--seg-o", "0");
        return;
      }
      root.style.setProperty("--seg-x", `${active.offsetLeft}px`);
      root.style.setProperty("--seg-y", `${active.offsetTop}px`);
      root.style.setProperty("--seg-w", `${active.offsetWidth}px`);
      root.style.setProperty("--seg-h", `${active.offsetHeight}px`);
      root.style.setProperty("--seg-o", "1");
      if (!ready) {
        ready = true;
        // Place the selection first, then allow it to animate.
        requestAnimationFrame(() => root.setAttribute("data-seg-ready", ""));
      }
    };
    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-pressed"] });
    const resizes = new ResizeObserver(measure);
    resizes.observe(root);
    return () => {
      mutations.disconnect();
      resizes.disconnect();
    };
  }, []);

  return (
    <BaseToggleGroup
      {...props}
      ref={ref}
      className={mergeClassName("ps-track relative inline-flex items-center gap-0.5 rounded-control p-0.5", className)}
    >
      <span aria-hidden="true" className="ps-seg-indicator pointer-events-none absolute left-0 top-0 rounded-inset" />
      {children}
    </BaseToggleGroup>
  );
}

export const Segment = styled(
  BaseToggle,
  "ps-seg relative z-10 inline-flex h-control-sm flex-1 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-inset px-3 text-meta font-medium focus-ring data-[disabled]:opacity-45",
  "Segment",
);

export const Toolbar = {
  Root: styled(BaseToolbar.Root, "ps-bar inline-flex items-center gap-0.5 rounded-control p-1", "Toolbar.Root"),
  Group: styled(BaseToolbar.Group, "flex items-center gap-0.5", "Toolbar.Group"),
  Button: styled(
    BaseToolbar.Button,
    "ps-bar-btn ps-press inline-flex h-control-sm cursor-pointer select-none items-center gap-1.5 rounded-inset px-2.5 text-meta font-medium focus-ring data-[disabled]:opacity-45",
    "Toolbar.Button",
  ),
  Link: styled(
    BaseToolbar.Link,
    "inline-flex h-control-sm items-center rounded-inset px-2.5 text-meta font-medium text-accent-text hover:bg-control focus-ring",
    "Toolbar.Link",
  ),
  Separator: styled(BaseToolbar.Separator, "mx-1 h-4 w-px bg-line", "Toolbar.Separator"),
};
