import { createFileRoute } from "@tanstack/react-router";
import { Feedback } from "../features/account/Feedback";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/feedback")({
  ssr: false,
  staticData: { page: pages["/you/feedback"] },
  head: () => pageHead(pages["/you/feedback"]),
  component: Feedback,
});
