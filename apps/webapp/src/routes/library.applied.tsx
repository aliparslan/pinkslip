import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/library/applied")({
  ssr: false,
  staticData: { page: pages["/library/applied"] },
  head: () => pageHead(pages["/library/applied"]),
  component: RoutePlaceholder,
});
