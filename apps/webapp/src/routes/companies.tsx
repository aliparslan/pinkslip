import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyPath } from "../features/navigation/compatibility";

export const Route = createFileRoute("/companies")({
  ssr: true,
  beforeLoad: ({ location }) => redirectLegacyPath("/companies", location),
});
