import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { WifiSlash } from "@phosphor-icons/react";
import { Alert } from "../../kit";
import styles from "./States.module.css";

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);

/** Query's online state is the source of truth: it pauses requests while
 * offline and refetches on reconnect, so the strip needs no retry button.
 * The server render always assumes online. */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => onlineManager.isOnline(), () => true);
}

/** The current `.feed-stale-notice` offline copy, for every page. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return <div className={styles.offline}>
    <Alert tone="warning" size="compact" icon={WifiSlash}>
      You're offline. Changes and new results return when you're back online.
    </Alert>
  </div>;
}
