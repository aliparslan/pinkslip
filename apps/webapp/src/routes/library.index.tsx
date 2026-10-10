import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyPath } from "../features/navigation/compatibility";

export const Route = createFileRoute("/library/")({
  ssr: true,
  beforeLoad: ({ location }) => redirectLegacyPath("/library", location),
});
