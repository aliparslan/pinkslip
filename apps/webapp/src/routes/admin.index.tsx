import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  staticData: { page: pages["/admin"] },
  head: () => pageHead(pages["/admin"]),
  component: RoutePlaceholder,
});
