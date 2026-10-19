/** What opens the sign-in sheet over the page you're on: You's card, the
 * welcome's "I have an account", Account as a guest. Later the moments
 * that need an account (saving a job, keeping a search) bring their own
 * title, as Paper "Sign in · Oct 15" S1 does with "Save your jobs". */
export interface SignInRequest {
  title?: string;
  /** One line under the title (K1: "It's been a while…"). */
  detail?: string;
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
