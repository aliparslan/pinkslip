import { createFileRoute } from "@tanstack/react-router";
import { privacyPolicy } from "@pinkslip/domain/legal";
import { LegalPage, legalHead } from "../features/LegalPage";
import { pages } from "../features/navigation/pages";

export const Route = createFileRoute("/privacy")({
  ssr: true,
  staticData: { page: pages["/privacy"] },
  head: () => legalHead(privacyPolicy),
  component: () => <LegalPage page={privacyPolicy} />,
});
