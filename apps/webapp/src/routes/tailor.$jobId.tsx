import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/tailor/$jobId")({
  ssr: false,
  staticData: { page: pages["/tailor/$jobId"] },
  head: () => pageHead(pages["/tailor/$jobId"]),
  component: RoutePlaceholder,
});
