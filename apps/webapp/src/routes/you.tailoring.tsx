import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { Tailoring } from "../features/tailoring/Tailoring";

export const Route = createFileRoute("/you/tailoring")({
  ssr: false,
  staticData: { page: pages["/you/tailoring"] },
  head: () => pageHead(pages["/you/tailoring"]),
  component: Tailoring,
});
