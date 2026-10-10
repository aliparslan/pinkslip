import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { SelectJob } from "../features/split/SelectJob";

// The list renders in the shared layout (features/split).
export const Route = createFileRoute("/_split/library/saved")({
  ssr: false,
  staticData: { page: pages["/library/saved"] },
  head: () => pageHead(pages["/library/saved"]),
  component: SelectJob,
});
