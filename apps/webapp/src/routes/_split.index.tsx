import { createFileRoute } from "@tanstack/react-router";
import { publicJobsQueryOptions } from "@pinkslip/data";
import { validateFeedSearch } from "../features/feed/criteria";
import { pages } from "../features/navigation/pages";
import { SelectJob } from "../features/split/SelectJob";

const description = "Early-career software jobs (internships, new grad and early career), straight from company career pages and updated every 15 minutes.";

// The feed itself renders in the shared layout (features/split); this route
// owns the URL's filters, the server-rendered catalog and the page metadata.
export const Route = createFileRoute("/_split/")({
  ssr: true,
  staticData: { page: pages["/"] },
  validateSearch: validateFeedSearch,
  head: () => ({
    meta: [
      { title: "Pinkslip · Early-career jobs from company career pages" },
      { name: "description", content: description },
      { property: "og:title", content: "Pinkslip" },
      { property: "og:description", content: description },
    ],
    links: [{ rel: "canonical", href: "https://pinkslip.work/" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicJobsQueryOptions(context.api)),
  component: SelectJob,
});
