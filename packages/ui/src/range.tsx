import { Meter as BaseMeter } from "@base-ui/react/meter";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { styled } from "./lib/cn";

export const Slider = {
  Root: styled(BaseSlider.Root, "flex w-full touch-none flex-col gap-2", "Slider.Root"),
  Label: styled(BaseSlider.Label, "text-ui font-medium text-ink", "Slider.Label"),
  Value: styled(BaseSlider.Value, "text-ui tabular-nums text-ink-2", "Slider.Value"),
  Control: styled(
    BaseSlider.Control,
    "relative flex h-7 w-full cursor-pointer select-none items-center data-[disabled]:cursor-not-allowed",
    "Slider.Control",
  ),
  Track: styled(BaseSlider.Track, "ps-slider-track relative h-1.5 w-full rounded-pill", "Slider.Track"),
  Indicator: styled(BaseSlider.Indicator, "ps-slider-range rounded-pill", "Slider.Indicator"),
  Thumb: styled(
    BaseSlider.Thumb,
    "ps-thumb size-5 rounded-pill outline-accent transition-[scale] dur-fast ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 data-[dragging]:scale-110",
    "Slider.Thumb",
  ),
};

export const NumberField = {
  Root: styled(BaseNumberField.Root, "flex flex-col items-start gap-1.5", "NumberField.Root"),
  ScrubArea: styled(BaseNumberField.ScrubArea, "cursor-ew-resize", "NumberField.ScrubArea"),
  ScrubAreaCursor: BaseNumberField.ScrubAreaCursor,
  Group: styled(
    BaseNumberField.Group,
    "ps-field inline-flex h-control items-stretch overflow-hidden",
    "NumberField.Group",
  ),
  Decrement: styled(
    BaseNumberField.Decrement,
    "flex w-10 cursor-pointer items-center justify-center text-ink-2 transition-colors hover:bg-control hover:text-ink active:bg-control-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35",
    "NumberField.Decrement",
  ),
  Increment: styled(
    BaseNumberField.Increment,
    "flex w-10 cursor-pointer items-center justify-center text-ink-2 transition-colors hover:bg-control hover:text-ink active:bg-control-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35",
    "NumberField.Increment",
  ),
  Input: styled(
    BaseNumberField.Input,
    "w-14 bg-transparent text-center text-ui tabular-nums text-ink outline-none",
    "NumberField.Input",
  ),
};

const gaugeRoot = "flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-2";
const gaugeTrack = "ps-gauge-track h-1.5 w-full basis-full overflow-hidden rounded-pill";

export const Meter = {
  Root: styled(BaseMeter.Root, gaugeRoot, "Meter.Root"),
  Label: styled(BaseMeter.Label, "text-ui font-medium text-ink", "Meter.Label"),
  Value: styled(BaseMeter.Value, "text-meta tabular-nums text-ink-3", "Meter.Value"),
  Track: styled(BaseMeter.Track, gaugeTrack, "Meter.Track"),
  Indicator: styled(BaseMeter.Indicator, "ps-gauge-fill rounded-pill transition-[width] dur-slow ease-out", "Meter.Indicator"),
};

export const Progress = {
  Root: styled(BaseProgress.Root, gaugeRoot, "Progress.Root"),
  Label: styled(BaseProgress.Label, "text-ui font-medium text-ink", "Progress.Label"),
  Value: styled(BaseProgress.Value, "text-meta tabular-nums text-ink-3", "Progress.Value"),
  Track: styled(BaseProgress.Track, gaugeTrack, "Progress.Track"),
  Indicator: styled(
    BaseProgress.Indicator,
    "ps-gauge-fill rounded-pill transition-[width] dur-slow ease-out data-[indeterminate]:ps-indeterminate",
    "Progress.Indicator",
  ),
};
