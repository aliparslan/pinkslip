import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { styled } from "./lib/cn";

export const Accordion = {
  Root: styled(BaseAccordion.Root, "flex w-full flex-col", "Accordion.Root"),
  Item: styled(BaseAccordion.Item, "border-b border-line", "Accordion.Item"),
  Header: styled(BaseAccordion.Header, "m-0", "Accordion.Header"),
  Trigger: styled(
    BaseAccordion.Trigger,
    "group flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left text-body font-medium text-ink focus-ring",
    "Accordion.Trigger",
  ),
  Panel: styled(BaseAccordion.Panel, "motion-collapse h-(--accordion-panel-height)", "Accordion.Panel"),
};

export const Collapsible = {
  Root: styled(BaseCollapsible.Root, "flex flex-col", "Collapsible.Root"),
  Trigger: styled(
    BaseCollapsible.Trigger,
    "group inline-flex w-fit cursor-pointer items-center gap-1 rounded-item text-ui font-medium text-accent-text hover:opacity-80 focus-ring",
    "Collapsible.Trigger",
  ),
  Panel: styled(BaseCollapsible.Panel, "motion-collapse h-(--collapsible-panel-height)", "Collapsible.Panel"),
};

/** Sections of one screen. The pink rule glides to the active tab. */
export const Tabs = {
  Root: styled(BaseTabs.Root, "flex min-w-0 flex-col", "Tabs.Root"),
  List: styled(BaseTabs.List, "relative z-0 flex gap-6 border-b border-line", "Tabs.List"),
  Tab: styled(
    BaseTabs.Tab,
    "flex h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap text-ui font-medium text-ink-3 outline-none transition-colors hover:text-ink focus-visible:text-ink data-[selected]:text-ink",
    "Tabs.Tab",
  ),
  Indicator: styled(
    BaseTabs.Indicator,
    "absolute -bottom-px left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-pill bg-accent motion-glide",
    "Tabs.Indicator",
  ),
  Panel: styled(BaseTabs.Panel, "pt-4 outline-none", "Tabs.Panel"),
};
