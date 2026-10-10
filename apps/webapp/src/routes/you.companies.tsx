import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/companies")({
  ssr: false,
  staticData: { page: pages["/you/companies"] },
  head: () => pageHead(pages["/you/companies"]),
  component: RoutePlaceholder,
});
