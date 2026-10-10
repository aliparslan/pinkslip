import { useMatches } from "@tanstack/react-router";
import { Heading, Stack, Text } from "../../kit";

/** Deliberately no domain queries or actions until the Phase 4 feature slice. */
export function RoutePlaceholder() {
  const page = useMatches({ select: (matches) => matches.at(-1)?.staticData.page });
  return <Stack as="section" gap="4">
    <Heading level={1} variant={page?.depth ? "screen" : "root"}>{page?.title ?? "Pinkslip"}</Heading>
    <Text tone="ink-3">This page is coming soon.</Text>
  </Stack>;
}
