import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { Overview } from "../features/admin/Overview";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  staticData: { page: pages["/admin"] },
  head: () => pageHead(pages["/admin"]),
  component: Overview,
});
