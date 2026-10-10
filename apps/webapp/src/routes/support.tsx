import { createFileRoute } from "@tanstack/react-router";
import { supportPage } from "@pinkslip/domain/legal";
import { LegalPage, legalHead } from "../features/LegalPage";
import { pages } from "../features/navigation/pages";

export const Route = createFileRoute("/support")({
  ssr: true,
  staticData: { page: pages["/support"] },
  head: () => legalHead(supportPage),
  component: () => <LegalPage page={supportPage} />,
});
