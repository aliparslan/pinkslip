import { createFileRoute } from "@tanstack/react-router";
import { termsPage } from "@pinkslip/domain/legal";
import { LegalPage, legalHead } from "../features/LegalPage";
import { pages } from "../features/navigation/pages";

export const Route = createFileRoute("/terms")({
  ssr: true,
  staticData: { page: pages["/terms"] },
  head: () => legalHead(termsPage),
  component: () => <LegalPage page={termsPage} />,
});
