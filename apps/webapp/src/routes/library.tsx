import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { BookmarkSimple, CheckCircle } from "@phosphor-icons/react";
import { Heading, Stack, Tabs } from "../kit";

// The current design: a "Library" title over the Saved/Applied segmented tabs.
// Each tab is its own URL, so the tabs are links and the URL is the state.
export const Route = createFileRoute("/library")({ ssr: true, component: Library });

type View = "saved" | "applied";

function Library() {
  const view: View = useMatches({ select: (matches) => matches.some((match) => match.routeId === "/library/applied") }) ? "applied" : "saved";
  return <Stack gap="4">
    <Heading level={1} variant="root">Library</Heading>
    <Tabs<View> label="Your jobs" value={view} tabs={[
      { value: "saved", label: "Saved", icon: BookmarkSimple, render: <Link to="/library/saved" /> },
      { value: "applied", label: "Applied", icon: CheckCircle, render: <Link to="/library/applied" /> },
    ]} />
    <Outlet />
  </Stack>;
}
