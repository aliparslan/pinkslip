import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyPath } from "../features/navigation/compatibility";

export const Route = createFileRoute("/resume")({
  ssr: true,
  beforeLoad: ({ location }) => redirectLegacyPath("/resume", location),
});
