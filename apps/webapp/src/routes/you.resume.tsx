import { createFileRoute } from "@tanstack/react-router";
import { Resume } from "../features/resume/Resume";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/resume")({
  ssr: false,
  staticData: { page: pages["/you/resume"] },
  head: () => pageHead(pages["/you/resume"]),
  // The record being edited: contact, skills, opt:<kind>, or <section>:<id>.
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search.edit === "string" && search.edit ? { edit: search.edit.slice(0, 80) } : {},
  component: Resume,
});
