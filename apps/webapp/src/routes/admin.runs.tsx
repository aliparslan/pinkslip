import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { Runs } from "../features/admin/Runs";

export const Route = createFileRoute("/admin/runs")({
  ssr: false,
  staticData: { page: pages["/admin/runs"] },
  head: () => pageHead(pages["/admin/runs"]),
  component: Runs,
});
