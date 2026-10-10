import { createFileRoute } from "@tanstack/react-router";
import { supportPage } from "@pinkslip/domain/legal";
import { LegalPage, legalHead } from "../features/LegalPage";

export const Route = createFileRoute("/support")({
  head: () => legalHead(supportPage),
  component: () => <LegalPage page={supportPage} />,
});
