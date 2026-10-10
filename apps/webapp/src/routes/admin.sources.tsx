import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/admin/sources")({
  ssr: false,
  staticData: { page: pages["/admin/sources"] },
  head: () => pageHead(pages["/admin/sources"]),
  component: RoutePlaceholder,
});
