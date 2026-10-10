import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { Sources } from "../features/companies/Sources";

export const Route = createFileRoute("/admin/sources")({
  ssr: false,
  staticData: { page: pages["/admin/sources"] },
  head: () => pageHead(pages["/admin/sources"]),
  component: Sources,
});
