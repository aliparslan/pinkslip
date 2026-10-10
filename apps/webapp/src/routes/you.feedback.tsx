import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/feedback")({
  ssr: false,
  staticData: { page: pages["/you/feedback"] },
  head: () => pageHead(pages["/you/feedback"]),
  component: RoutePlaceholder,
});
