import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/about")({
  ssr: true,
  staticData: { page: pages["/about"] },
  head: () => pageHead(pages["/about"]),
  component: RoutePlaceholder,
});
