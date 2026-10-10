import { createFileRoute, notFound } from "@tanstack/react-router";
import { EmptyState } from "../kit";

// Development only: the first load throws so the route error page and its
// "Try again" can be exercised by hand and by e2e/kit.pw.ts.
let failNextLoad = true;

export const Route = createFileRoute("/_kit-error")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  loader: () => {
    if (failNextLoad) {
      failNextLoad = false;
      throw new Error("Deliberate failure for the error page demo");
    }
    return null;
  },
  head: () => ({ meta: [{ title: "Error demo · Pinkslip" }] }),
  component: () => <EmptyState level={1} title="Recovered" message="The retry reloaded this route's data." />,
});
