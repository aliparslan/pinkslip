import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/admin/inbox")({
  ssr: false,
  staticData: { page: pages["/admin/inbox"] },
  head: () => pageHead(pages["/admin/inbox"]),
  component: RoutePlaceholder,
});
