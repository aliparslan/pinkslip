/** What opens the sign-in sheet over the page you're on: You's card, the
 * welcome's "I have an account", Account as a guest, and a guest's first
 * save (M1, "Keep your saved jobs"), which brings its own title. */
export interface SignInRequest {
  title?: string;
  /** One line under the title (K1: "It's been a while…"). */
  detail?: string;
  /** A "Not now" under the ways in, for an ask nobody tapped into (M1). */
  notNow?: boolean;
  /** The kit's walk-through: every step, with nothing sent to Pinkslip. */
  sample?: boolean;
  /** Runs once the sheet has gone, signed in or not. */
  onClosed?: () => void;
}

const listeners = new Set<(request: SignInRequest) => void>();

export function openSignIn(request: SignInRequest = {}) {
  for (const listener of listeners) listener(request);
}

export function onSignInRequest(listener: (request: SignInRequest) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
