import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/account")({
  ssr: false,
  staticData: { page: pages["/you/account"] },
  head: () => pageHead(pages["/you/account"]),
  component: RoutePlaceholder,
});
