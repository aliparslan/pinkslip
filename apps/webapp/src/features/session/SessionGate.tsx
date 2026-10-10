import type { ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { useSession } from "@pinkslip/data";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { NotFoundPage } from "../states/PageStates";
import { AccessGate } from "./AccessGate";

/** Decides what a page may show from its `access` level and the session.
 * Public pages (the catalog, legal pages, 404s) never wait for it. */
export function SessionGate({ children }: { children: ReactNode }) {
  const access = useMatches({ select: (matches) => matches.at(-1)?.staticData.page?.access ?? "public" });
  const session = useSession();
  if (access === "public") return children;

  // Only a first load blocks the page. A failed background refresh keeps
  // showing the session it already has.
  if (!session.data) {
    if (!session.isError) return <PageLoading label="Loading your account" />;
    return <PageFailure level={1} title="Couldn't load your account"
      onRetry={() => void session.refetch()} retrying={session.isFetching} />;
  }
  if (session.data.state === "locked") return <AccessGate />;
  // Admin pages don't reveal that they exist to anyone else.
  if (access === "admin" && !session.data.me?.is_admin) return <NotFoundPage />;
  return children;
}
