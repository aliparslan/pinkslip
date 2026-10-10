import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/resume")({
  ssr: false,
  staticData: { page: pages["/you/resume"] },
  head: () => pageHead(pages["/you/resume"]),
  component: RoutePlaceholder,
});
