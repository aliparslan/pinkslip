import { Select as BaseSelect } from "@base-ui/react/select";
import { cn, styled } from "./lib/cn";
import { checkItem, groupLabel, itemIndicator, separator, surface } from "./lib/surface";

export const Select = {
  Root: BaseSelect.Root,
  Label: styled(BaseSelect.Label, "text-ui font-medium text-ink", "Select.Label"),
  Trigger: styled(
    BaseSelect.Trigger,
    "ps-field inline-flex h-control min-w-48 cursor-pointer select-none items-center justify-between gap-3 px-3 text-ui text-ink outline-none",
    "Select.Trigger",
  ),
  Value: styled(BaseSelect.Value, "truncate data-[placeholder]:text-ink-3", "Select.Value"),
  Icon: styled(BaseSelect.Icon, "flex text-ink-3", "Select.Icon"),
  Portal: BaseSelect.Portal,
  Positioner: styled(BaseSelect.Positioner, "z-50 outline-none select-none", "Select.Positioner"),
  Popup: styled(
    BaseSelect.Popup,
    cn(
      surface,
      "motion-pop",
      "max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto p-1 data-[side=none]:min-w-[calc(var(--anchor-width)+0.75rem)] data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[ending-style]:scale-100",
    ),
    "Select.Popup",
  ),
  List: styled(BaseSelect.List, "outline-none", "Select.List"),
  Item: styled(BaseSelect.Item, checkItem, "Select.Item"),
  ItemIndicator: styled(BaseSelect.ItemIndicator, itemIndicator, "Select.ItemIndicator"),
  ItemText: styled(BaseSelect.ItemText, "col-start-2 truncate", "Select.ItemText"),
  Group: BaseSelect.Group,
  GroupLabel: styled(BaseSelect.GroupLabel, groupLabel, "Select.GroupLabel"),
  Separator: styled(BaseSelect.Separator, separator, "Select.Separator"),
  ScrollUpArrow: styled(
    BaseSelect.ScrollUpArrow,
    "top-0 z-10 flex h-5 w-full items-center justify-center rounded-t-surface bg-raised text-ink-3",
    "Select.ScrollUpArrow",
  ),
  ScrollDownArrow: styled(
    BaseSelect.ScrollDownArrow,
    "bottom-0 z-10 flex h-5 w-full items-center justify-center rounded-b-surface bg-raised text-ink-3",
    "Select.ScrollDownArrow",
  ),
};
