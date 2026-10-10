import { createFileRoute } from "@tanstack/react-router";
import { Alerts } from "../features/alerts/Alerts";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/alerts")({
  ssr: false,
  staticData: { page: pages["/you/alerts"] },
  head: () => pageHead(pages["/you/alerts"]),
  component: Alerts,
});
