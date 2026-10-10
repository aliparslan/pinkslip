import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { RoutePlaceholder } from "../features/navigation/RoutePlaceholder";

export const Route = createFileRoute("/library/saved")({
  ssr: false,
  staticData: { page: pages["/library/saved"] },
  head: () => pageHead(pages["/library/saved"]),
  component: RoutePlaceholder,
});
