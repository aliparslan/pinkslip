import { appPath } from "../lib/paths";

/* Universal links and alert URLs use the web's paths. Map them to the
   app's routes before the router sees them. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, "https://pinkslip.work");
    if (url.protocol === "pinkslip:") return appPath(`/${url.host}${url.pathname}`.replace(/\/$/, "") || "/") ?? "/";
    return appPath(url.pathname) ?? "/";
  } catch {
    return "/";
  }
}
