import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyPath } from "../features/navigation/compatibility";

export const Route = createFileRoute("/you/operations")({
  ssr: true,
  beforeLoad: ({ location }) => redirectLegacyPath("/you/operations", location),
});
