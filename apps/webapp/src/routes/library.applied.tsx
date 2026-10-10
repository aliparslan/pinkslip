import { createFileRoute } from "@tanstack/react-router";
import { Text } from "../kit";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/library/applied")({
  ssr: false,
  staticData: { page: pages["/library/applied"] },
  head: () => pageHead(pages["/library/applied"]),
  component: () => <Text tone="ink-3">Applied jobs are coming soon.</Text>,
});
