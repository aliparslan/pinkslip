import { createFileRoute } from "@tanstack/react-router";
import { SplitLayout } from "../features/split/SplitLayout";

// Jobs, Library and a job: the list stays mounted while jobs open beside it.
export const Route = createFileRoute("/_split")({ ssr: true, component: SplitLayout });
