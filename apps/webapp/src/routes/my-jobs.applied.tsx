import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyPath } from "../features/navigation/compatibility";

export const Route = createFileRoute("/my-jobs/applied")({
  ssr: true,
  beforeLoad: ({ location }) => redirectLegacyPath("/my-jobs/applied", location),
});
