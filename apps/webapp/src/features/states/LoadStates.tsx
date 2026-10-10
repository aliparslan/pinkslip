import { ArrowClockwise, WarningCircle, WifiSlash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Alert, Button, EmptyState, Spinner } from "../../kit";
import styles from "./States.module.css";

/** A page or section that is still loading (the current `.page-loading`):
 * a centered spinner that fades in, so fast loads never flash it. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return <div className={styles.loading} aria-busy="true"><Spinner size={20} label={label} /></div>;
}

interface RetryProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Spinner on the retry button while the refetch runs. */
  retrying?: boolean;
}

/** A page whose data didn't load (`PageFailure.svelte`). `actions` adds a
 * way out, such as a link back. */
export function PageFailure({
  title = "Unable to load", message = "Check your connection and try again.", onRetry, retrying, level = 2, actions,
}: RetryProps & { level?: 1 | 2; actions?: ReactNode }) {
  return <EmptyState level={level} alert icon={WifiSlash} title={title} message={message}
    actions={(onRetry || actions) && <>
      {onRetry && <Button variant="secondary" icon={ArrowClockwise} pending={retrying} onClick={onRetry}>Try again</Button>}
      {actions}
    </>} />;
}

/** One section of a page that didn't load (`InlineFailure.svelte`); the rest
 * of the page keeps working. */
export function InlineFailure({
  title = "Unable to load", message = "Check your connection and try again.", onRetry, retrying,
}: RetryProps) {
  return <Alert tone="error" icon={WarningCircle} title={title}
    action={onRetry && <Button variant="secondary" size="compact" icon={ArrowClockwise} pending={retrying}
      onClick={onRetry}>Try again</Button>}>
    {message}
  </Alert>;
}
