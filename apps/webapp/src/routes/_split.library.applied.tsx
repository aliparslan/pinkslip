import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { SelectJob } from "../features/split/SelectJob";

// The list renders in the shared layout (features/split).
export const Route = createFileRoute("/_split/library/applied")({
  ssr: false,
  staticData: { page: pages["/library/applied"] },
  head: () => pageHead(pages["/library/applied"]),
  component: SelectJob,
});
