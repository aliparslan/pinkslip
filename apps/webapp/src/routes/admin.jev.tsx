import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/admin/jev")({
  ssr: false,
  staticData: { page: pages["/admin/jev"] },
  head: () => pageHead(pages["/admin/jev"]),
  component: RoutePlaceholder,
});
