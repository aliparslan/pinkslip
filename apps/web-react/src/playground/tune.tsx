import { Button } from "@pinkslip/ui/button";
import { SlidersIcon } from "@pinkslip/ui/icons";
import { Drawer, DrawerHandle } from "@pinkslip/ui/overlay";
import { Segment, Segmented } from "@pinkslip/ui/toggle";
import { useLayoutEffect, useState, type ReactNode } from "react";

/* The playground's own controls. The design is fixed in packages/ui; these
   only change how it is viewed: the theme, and how fast motion plays so a
   transition can be inspected frame by frame. */

export interface Tune {
  theme: "system" | "light" | "dark";
  speed: 1 | 2 | 4 | 10;
  motion: "system" | "full" | "reduced";
}

export const defaultTune: Tune = { theme: "system", speed: 1, motion: "system" };

const storageKey = "pinkslip-playground-tune-v3";
const hostTheme = document.documentElement.getAttribute("data-theme");

function loadTune(): Tune {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultTune;
    const saved = JSON.parse(raw) as Partial<Tune>;
    return {
      theme: saved.theme ?? defaultTune.theme,
      speed: saved.speed ?? defaultTune.speed,
      motion: saved.motion ?? defaultTune.motion,
    };
  } catch {
    return defaultTune;
  }
}

function applyTune(tune: Tune) {
  const root = document.documentElement;
  if (tune.theme === "system") {
    if (hostTheme) root.setAttribute("data-theme", hostTheme);
    else root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", tune.theme);
  }
  if (tune.speed === 1) root.style.removeProperty("--motion-scale");
  else root.style.setProperty("--motion-scale", String(tune.speed));
  if (tune.motion === "system") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", tune.motion);
}

export function useTune() {
  const [tune, setTune] = useState<Tune>(loadTune);
  // Layout effect so a saved theme applies before the first paint.
  useLayoutEffect(() => {
    applyTune(tune);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(tune));
    } catch {
      /* Storage can be unavailable; tuning still works for this visit. */
    }
  }, [tune]);
  return [tune, setTune] as const;
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-ui font-medium text-ink">{label}</span>
        {hint ? <span className="text-meta text-ink-3">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SegmentedRow<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Row label={label} hint={hint}>
      <Segmented
        value={[String(value)]}
        onValueChange={(next) => {
          const chosen = options.find((option) => String(option.value) === next[0]);
          if (chosen) onChange(chosen.value);
        }}
        aria-label={label}
        className="w-full"
      >
        {options.map((option) => (
          <Segment key={String(option.value)} value={String(option.value)}>
            {option.label}
          </Segment>
        ))}
      </Segmented>
    </Row>
  );
}

export function TunePanel({ tune, setTune }: { tune: Tune; setTune: (tune: Tune) => void }) {
  const set = <K extends keyof Tune>(key: K, value: Tune[K]) => setTune({ ...tune, [key]: value });

  return (
    <Drawer.Root>
      <Drawer.Trigger render={<Button size="sm" />}>
        <SlidersIcon size={14} />
        View
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Popup>
            <DrawerHandle />
            <Drawer.Content>
              <Drawer.Title>View settings</Drawer.Title>
              <Drawer.Description>
                These change how the page is shown, not the design. They are kept in this browser.
              </Drawer.Description>
              <div className="mt-5 flex flex-col gap-6">
                <SegmentedRow
                  label="Theme"
                  value={tune.theme}
                  options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                  onChange={(value) => set("theme", value)}
                />
                <SegmentedRow
                  label="Motion speed"
                  hint="Slow every transition down to inspect it. Durations scale together."
                  value={tune.speed}
                  options={[
                    { value: 1, label: "1×" },
                    { value: 2, label: "½×" },
                    { value: 4, label: "¼×" },
                    { value: 10, label: "⅒×" },
                  ]}
                  onChange={(value) => set("speed", value)}
                />
                <SegmentedRow
                  label="Reduced motion"
                  hint="Reduced keeps fades and drops movement: nothing slides, scales, or springs."
                  value={tune.motion}
                  options={[
                    { value: "system", label: "System" },
                    { value: "full", label: "Full" },
                    { value: "reduced", label: "Reduced" },
                  ]}
                  onChange={(value) => set("motion", value)}
                />
                <Button onClick={() => setTune(defaultTune)}>Reset</Button>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
