import { createFileRoute } from "@tanstack/react-router";
import { Text } from "../kit";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/library/saved")({
  ssr: false,
  staticData: { page: pages["/library/saved"] },
  head: () => pageHead(pages["/library/saved"]),
  component: () => <Text tone="ink-3">Saved jobs are coming soon.</Text>,
});
