import { createFileRoute, redirect } from "@tanstack/react-router";

/** Push links open an application's page (the iPhone app has one). The web
 * doesn't yet, so they land on Applied, where the application is listed. */
export const Route = createFileRoute("/applications/$applicationId")({
  ssr: true,
  beforeLoad: () => {
    throw redirect({ href: "/library/applied", statusCode: 307, replace: true });
  },
});
