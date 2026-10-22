import { createFileRoute } from "@tanstack/react-router";
import { supportThanksPage } from "@pinkslip/domain/legal";
import { LegalPage, legalHead } from "../features/LegalPage";
import { pages } from "../features/navigation/pages";

/** Where Stripe sends people after a tip. On an iPhone with Pinkslip the
 * universal link opens the app instead; this is the page when it doesn't. */
export const Route = createFileRoute("/support_/thanks")({
  ssr: true,
  staticData: { page: pages["/support/thanks"] },
  head: () => legalHead(supportThanksPage),
  component: () => <LegalPage page={supportThanksPage} />,
});
