import { createFileRoute } from "@tanstack/react-router";
import { privacyPolicy } from "@pinkslip/domain/legal";
import { LegalPage, legalHead } from "../features/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => legalHead(privacyPolicy),
  component: () => <LegalPage page={privacyPolicy} />,
});
