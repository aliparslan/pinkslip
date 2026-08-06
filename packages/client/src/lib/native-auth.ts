import { platform } from "./platform";

export function isNativeIosAuthAvailable() {
  return platform().auth.appleAvailable();
}

export async function signInWithAppleNative() {
  return platform().auth.signInWithApple();
}
