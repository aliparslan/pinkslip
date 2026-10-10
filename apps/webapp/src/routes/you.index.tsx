import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import {
  Bell, Buildings, CaretRight, ChatCircleText, FileText, Lifebuoy, SlidersHorizontal, Sparkle, UserCircle,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useOwnerChangeCleanup, useSession } from "@pinkslip/data";
import { Button, Heading, Icon, Inline, Separator, Stack, Surface, Text } from "../kit";
import { pages, pageHead, youGroups, type SectionPath } from "../features/navigation/pages";
import styles from "../styles/You.module.css";

export const Route = createFileRoute("/you/")({
  ssr: false,
  staticData: { page: pages["/you"] },
  head: () => pageHead(pages["/you"]),
  component: You,
});

const icons: Partial<Record<SectionPath, PhosphorIcon>> = {
  "/you/preferences": SlidersHorizontal,
  "/you/alerts": Bell,
  "/you/companies": Buildings,
  "/you/resume": FileText,
  "/you/tailoring": Sparkle,
  "/you/answers": ChatCircleText,
  "/you/feedback": Lifebuoy,
  "/you/account": UserCircle,
};

/** The current design's You overview: grouped rows, each opening a section.
 * Row details (role counts, alert status) arrive with each Phase 4 screen. */
function You() {
  const session = useSession();
  useOwnerChangeCleanup();
  return <Stack gap="6">
    <Stack gap="2">
      <Heading level={1} variant="root">You</Heading>
      {session.isPending
        ? <Text tone="ink-3">Loading your account…</Text>
        : session.isError
          ? <Inline gap="3" wrap>
            <Text tone="bad">Your account couldn't be loaded.</Text>
            <Button variant="secondary" size="compact" onClick={() => void session.refetch()}>Try again</Button>
          </Inline>
          : <Text tone="ink-3">{session.data?.state === "authenticated" ? "You're signed in." : "Browsing as a guest."}</Text>}
    </Stack>
    {youGroups.map((group) => <Stack key={group.label} as="section" gap="2">
      <Text size="xs" weight="semibold" tone="ink-4">{group.label}</Text>
      <Surface variant="list" bleedOnPhone as="ul">
        {group.paths.map((to, index) => <Fragment key={to}>
          {index > 0 && <li aria-hidden><Separator /></li>}
          <li>
            <Link to={to} className={styles.row}>
              <Icon icon={icons[to] ?? CaretRight} size={20} />
              <Text as="span" weight="medium">{pages[to].title}</Text>
              <span className={styles.chevron}><Icon icon={CaretRight} size={16} weight="bold" /></span>
            </Link>
          </li>
        </Fragment>)}
      </Surface>
    </Stack>)}
  </Stack>;
}
