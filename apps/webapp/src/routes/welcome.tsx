import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { Onboarding } from "../features/onboarding/Onboarding";

export const Route = createFileRoute("/welcome")({
  ssr: false,
  staticData: { page: pages["/welcome"] },
  head: () => pageHead(pages["/welcome"]),
  component: Onboarding,
});
