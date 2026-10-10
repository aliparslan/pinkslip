import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/alerts")({
  ssr: false,
  staticData: { page: pages["/you/alerts"] },
  head: () => pageHead(pages["/you/alerts"]),
  component: RoutePlaceholder,
});
