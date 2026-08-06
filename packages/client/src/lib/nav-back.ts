// Lets any component ask the app shell to perform an animated "back" (the same
// pop slide as the edge-swipe gesture). App.svelte registers the handler; back
// buttons call requestBack() and fall back to a plain navigate() if unhandled.

type BackHandler = () => boolean;

let handler: BackHandler | null = null;

export function registerBackHandler(fn: BackHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** Returns true if the shell handled it with an animation. */
export function requestBack(): boolean {
  return handler ? handler() : false;
}
