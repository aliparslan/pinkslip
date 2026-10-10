import { createFileRoute } from "@tanstack/react-router";
import { pages, pageHead } from "../features/navigation/pages";
import { Answers } from "../features/answers/Answers";

export const Route = createFileRoute("/you/answers")({
  ssr: false,
  staticData: { page: pages["/you/answers"] },
  head: () => pageHead(pages["/you/answers"]),
  component: Answers,
});
