type MotionElement = Element | null | undefined;
let reducedMotionQuery: MediaQueryList | undefined;

export function prefersReducedMotion(): boolean {
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function delay(duration: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

export async function waitForAnimations(
  elements: readonly MotionElement[],
  fallbackDuration: number,
): Promise<void> {
  const animations = elements.flatMap((element) => element?.getAnimations() ?? []);
  if (animations.length === 0) {
    await delay(fallbackDuration);
    return;
  }
  await Promise.race([
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => undefined),
    delay(fallbackDuration),
  ]);
}

export function createFrameBatch<T>(
  apply: (value: T) => void,
  batchUpdates = true,
) {
  let frame: number | null = null;
  let pending: T;
  let queued = false;

  function run() {
    frame = null;
    if (!queued) return;
    queued = false;
    apply(pending);
  }

  return {
    schedule(value: T) {
      if (!batchUpdates) {
        apply(value);
        return;
      }
      pending = value;
      queued = true;
      if (frame === null) frame = window.requestAnimationFrame(run);
    },
    flush() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      run();
    },
    cancel() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      queued = false;
    },
  };
}
