import { createFileRoute } from "@tanstack/react-router";
import { About, ABOUT_DESCRIPTION } from "../features/about/About";
import { pages } from "../features/navigation/pages";
import { publicHead } from "../features/navigation/seo";

export const Route = createFileRoute("/about")({
  ssr: true,
  staticData: { page: pages["/about"] },
  head: () => publicHead({ title: "About · Pinkslip", shareTitle: "About Pinkslip", description: ABOUT_DESCRIPTION, path: "/about" }),
  component: About,
});
