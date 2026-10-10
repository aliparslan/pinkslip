import { createFileRoute } from "@tanstack/react-router";
import { Heading, Stack, Text } from "../kit";

// Placeholder until Library (saved and applied jobs) is ported in 4.4.
export const Route = createFileRoute("/library")({
  ssr: false,
  head: () => ({ meta: [{ title: "Library · Pinkslip" }] }),
  component: () => <Stack gap="2">
    <Heading level={1} variant="root">Library</Heading>
    <Text tone="ink-3">Saved and applied jobs are coming to the new app soon.</Text>
  </Stack>,
});
