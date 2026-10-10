import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyPath } from "../features/navigation/compatibility";

export const Route = createFileRoute("/settings")({
  ssr: true,
  beforeLoad: ({ location }) => redirectLegacyPath("/settings", location),
});
