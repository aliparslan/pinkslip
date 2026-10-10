import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/tailoring")({
  ssr: false,
  staticData: { page: pages["/you/tailoring"] },
  head: () => pageHead(pages["/you/tailoring"]),
  component: RoutePlaceholder,
});
