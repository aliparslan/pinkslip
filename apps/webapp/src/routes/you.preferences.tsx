import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/preferences")({
  ssr: false,
  staticData: { page: pages["/you/preferences"] },
  head: () => pageHead(pages["/you/preferences"]),
  component: RoutePlaceholder,
});
