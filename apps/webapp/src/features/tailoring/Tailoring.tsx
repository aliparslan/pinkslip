import { useMatches } from "@tanstack/react-router";
import { Sparkle } from "@phosphor-icons/react";
import { EmptyState, Heading, Stack } from "../../kit";
import { LinkButton } from "../navigation/LinkButton";

/** Tailoring stays a placeholder (D7) until the feature is un-tabled: the
 * coming-soon signal is intentional. Used by /you/tailoring and /tailor/:id. */
export function Tailoring() {
  const page = useMatches({ select: (matches) => matches.at(-1)?.staticData.page });
  return <Stack gap="6">
    <Heading level={1} variant="screen">{page?.title ?? "Tailoring"}</Heading>
    <EmptyState icon={Sparkle} title="Coming soon"
      message="Pinkslip will tailor your resume to each job, using only what's already on it."
      actions={<LinkButton to="/you/resume" variant="secondary">Review your resume</LinkButton>} />
  </Stack>;
}
