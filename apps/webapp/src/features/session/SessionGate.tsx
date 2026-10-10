import type { ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { WifiSlash } from "@phosphor-icons/react";
import { useSession } from "@pinkslip/data";
import { Button, EmptyState, Spinner } from "../../kit";
import { NotFoundPage } from "../states/PageStates";
import { AccessGate } from "./AccessGate";
import styles from "./Session.module.css";

/** Decides what a page may show from its `access` level and the session.
 * Public pages (the catalog, legal pages, 404s) never wait for it. */
export function SessionGate({ children }: { children: ReactNode }) {
  const access = useMatches({ select: (matches) => matches.at(-1)?.staticData.page?.access ?? "public" });
  const session = useSession();
  if (access === "public") return children;

  if (session.isPending) {
    return <div className={styles.pending} aria-busy="true"><Spinner size={20} label="Loading your account" /></div>;
  }
  if (session.isError) {
    return <EmptyState level={1} alert icon={WifiSlash} title="Couldn't load your account"
      message="Check your connection, then try again."
      actions={<Button variant="secondary" pending={session.isFetching} onClick={() => void session.refetch()}>Try again</Button>} />;
  }
  if (session.data.state === "locked") return <AccessGate />;
  // Admin pages don't reveal that they exist to anyone else.
  if (access === "admin" && !session.data.me?.is_admin) return <NotFoundPage />;
  return children;
}
