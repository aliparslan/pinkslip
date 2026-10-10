import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/you/answers")({
  ssr: false,
  staticData: { page: pages["/you/answers"] },
  head: () => pageHead(pages["/you/answers"]),
  component: RoutePlaceholder,
});
