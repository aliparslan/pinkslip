import { Button } from "@pinkslip/ui/button";
import { MinusIcon, PlusIcon } from "@pinkslip/ui/icons";
import { Meter, NumberField, Progress, Slider } from "@pinkslip/ui/range";
import { useEffect, useRef, useState } from "react";
import { Group, Specimen } from "../specimen";

const salary = (value: number) => `$${value}k`;

export function RangesGroup() {
  const [minimum, setMinimum] = useState(120);
  const [range, setRange] = useState<number[]>([110, 170]);
  const [progress, setProgress] = useState<number | null>(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  function tailor() {
    window.clearInterval(timer.current);
    setProgress(0);
    timer.current = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(100, (value ?? 0) + 7);
        if (next >= 100) window.clearInterval(timer.current);
        return next;
      });
    }, 140);
  }

  return (
    <Group id="ranges" title="Ranges and numbers">
      <Specimen name="Slider" use="Pick a value on a continuous scale, like the lowest salary worth an alert.">
        <div className="flex max-w-110 flex-col gap-8">
          <Slider.Root value={minimum} onValueChange={(value) => setMinimum(value as number)} min={60} max={250} step={5}>
            <div className="flex items-baseline justify-between">
              <Slider.Label>Minimum base salary</Slider.Label>
              <span className="text-ui tabular-nums text-ink-2">{salary(minimum)}</span>
            </div>
            <Slider.Control>
              <Slider.Track>
                <Slider.Indicator />
                <Slider.Thumb aria-label="Minimum base salary" />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
          <Slider.Root value={range} onValueChange={(value) => setRange(value as number[])} min={60} max={250} step={5} minStepsBetweenValues={2}>
            <div className="flex items-baseline justify-between">
              <Slider.Label>Salary range</Slider.Label>
              <span className="text-ui tabular-nums text-ink-2">
                {salary(range[0] ?? 0)} to {salary(range[1] ?? 0)}
              </span>
            </div>
            <Slider.Control>
              <Slider.Track>
                <Slider.Indicator />
                <Slider.Thumb index={0} aria-label="Lowest salary" />
                <Slider.Thumb index={1} aria-label="Highest salary" />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
        </div>
      </Specimen>

      <Specimen name="Number Field" use="A small exact number. Drag the label sideways to scrub.">
        <NumberField.Root defaultValue={1} min={0} max={10}>
          <NumberField.ScrubArea>
            <label className="cursor-ew-resize text-ui font-medium text-ink">Years of experience</label>
          </NumberField.ScrubArea>
          <NumberField.Group>
            <NumberField.Decrement aria-label="Fewer years">
              <MinusIcon size={14} />
            </NumberField.Decrement>
            <NumberField.Input />
            <NumberField.Increment aria-label="More years">
              <PlusIcon size={14} />
            </NumberField.Increment>
          </NumberField.Group>
        </NumberField.Root>
      </Specimen>

      <Specimen name="Meter" use="A known quantity within a range, like tailoring credits left this month.">
        <Meter.Root value={32} max={50} className="max-w-110">
          <Meter.Label>Tailoring credits</Meter.Label>
          <Meter.Value>{(_, value) => `${value} of 50 left`}</Meter.Value>
          <Meter.Track>
            <Meter.Indicator />
          </Meter.Track>
        </Meter.Root>
      </Specimen>

      <Specimen name="Progress" use="Work that is underway: a determinate task, and one with no known end.">
        <div className="flex max-w-110 flex-col gap-6">
          <Progress.Root value={progress}>
            <Progress.Label>Tailoring for Ramp</Progress.Label>
            <Progress.Value />
            <Progress.Track>
              <Progress.Indicator />
            </Progress.Track>
          </Progress.Root>
          <div>
            <Button size="sm" onClick={tailor}>
              Run again
            </Button>
          </div>
          <Progress.Root value={null}>
            <Progress.Label>Checking career sites</Progress.Label>
            <Progress.Track>
              <Progress.Indicator />
            </Progress.Track>
          </Progress.Root>
        </div>
      </Specimen>
    </Group>
  );
}
