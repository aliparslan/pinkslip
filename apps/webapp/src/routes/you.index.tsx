import { createFileRoute } from "@tanstack/react-router";
import { You } from "../features/you/You";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/")({
  ssr: false,
  staticData: { page: pages["/you"] },
  head: () => pageHead(pages["/you"]),
  component: You,
});
