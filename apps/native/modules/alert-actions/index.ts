import { requireOptionalNativeModule } from "expo";

const native = requireOptionalNativeModule<{ configure(apiUrl: string): void }>("AlertActions");

/** Tells the native handler where the API is. It keeps the address, since a
 * button can be pressed with the app closed and no JavaScript running. */
export function configureAlertActions(apiUrl: string): void {
  native?.configure(apiUrl);
}
