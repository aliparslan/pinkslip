import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { cn, styled } from "./lib/cn";
import { checkItem, groupLabel, item, itemIndicator, separator, surface } from "./lib/surface";

const listPopup = cn(
  surface,
  "motion-pop",
  "max-h-[min(var(--available-height),20rem)] w-(--anchor-width) overflow-y-auto overscroll-contain p-1",
);
const standaloneInput =
  "ps-field h-control w-full min-w-0 px-3 text-ui text-ink outline-none placeholder:text-ink-3";
const empty = "px-2.5 py-2 text-ui text-ink-3 empty:m-0 empty:p-0";

/** Choose one or more values from a known list, with type-to-filter. */
export const Combobox = {
  Root: BaseCombobox.Root,
  Label: styled(BaseCombobox.Label, "text-ui font-medium text-ink", "Combobox.Label"),
  Input: styled(BaseCombobox.Input, standaloneInput, "Combobox.Input"),
  InputGroup: styled(BaseCombobox.InputGroup, "relative flex items-center", "Combobox.InputGroup"),
  Trigger: styled(
    BaseCombobox.Trigger,
    "absolute right-2 flex size-6 cursor-pointer items-center justify-center rounded-item text-ink-3 hover:bg-control",
    "Combobox.Trigger",
  ),
  Clear: styled(
    BaseCombobox.Clear,
    "flex size-6 cursor-pointer items-center justify-center rounded-item text-ink-3 hover:bg-control",
    "Combobox.Clear",
  ),
  Chips: styled(
    BaseCombobox.Chips,
    "ps-field flex min-h-control w-full flex-wrap items-center gap-1 px-1.5 py-1",
    "Combobox.Chips",
  ),
  Chip: styled(
    BaseCombobox.Chip,
    "ps-chip inline-flex h-7 cursor-default items-center gap-1 rounded-item pl-2 pr-1 text-meta font-medium outline-none",
    "Combobox.Chip",
  ),
  ChipRemove: styled(
    BaseCombobox.ChipRemove,
    "flex size-5 cursor-pointer items-center justify-center rounded-mark hover:bg-accent hover:text-accent-ink",
    "Combobox.ChipRemove",
  ),
  ChipInput: styled(
    BaseCombobox.Input,
    "h-7 min-w-24 flex-1 bg-transparent px-1.5 text-ui text-ink outline-none placeholder:text-ink-3",
    "Combobox.ChipInput",
  ),
  Portal: BaseCombobox.Portal,
  Positioner: styled(BaseCombobox.Positioner, "z-50 outline-none", "Combobox.Positioner"),
  Popup: styled(BaseCombobox.Popup, listPopup, "Combobox.Popup"),
  Empty: styled(BaseCombobox.Empty, empty, "Combobox.Empty"),
  List: styled(BaseCombobox.List, "outline-none", "Combobox.List"),
  Item: styled(BaseCombobox.Item, checkItem, "Combobox.Item"),
  ItemIndicator: styled(BaseCombobox.ItemIndicator, itemIndicator, "Combobox.ItemIndicator"),
  Group: BaseCombobox.Group,
  GroupLabel: styled(BaseCombobox.GroupLabel, groupLabel, "Combobox.GroupLabel"),
  Separator: styled(BaseCombobox.Separator, separator, "Combobox.Separator"),
  Value: BaseCombobox.Value,
};

/** Free text with suggestions. The typed text is the value. */
export const Autocomplete = {
  Root: BaseAutocomplete.Root,
  Input: styled(BaseAutocomplete.Input, standaloneInput, "Autocomplete.Input"),
  Portal: BaseAutocomplete.Portal,
  Positioner: styled(BaseAutocomplete.Positioner, "z-50 outline-none", "Autocomplete.Positioner"),
  Popup: styled(BaseAutocomplete.Popup, listPopup, "Autocomplete.Popup"),
  Empty: styled(BaseAutocomplete.Empty, empty, "Autocomplete.Empty"),
  List: styled(BaseAutocomplete.List, "outline-none", "Autocomplete.List"),
  Item: styled(BaseAutocomplete.Item, item, "Autocomplete.Item"),
  Group: BaseAutocomplete.Group,
  GroupLabel: styled(BaseAutocomplete.GroupLabel, groupLabel, "Autocomplete.GroupLabel"),
};
