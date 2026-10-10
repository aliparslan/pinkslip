import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import {
  Bell, Buildings, CaretRight, ChatCircleDots, ClipboardText, FileText, PaintBrush, SlidersHorizontal, Sparkle,
  UserCircle, Wrench, type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { usePreferences, usePushSettings, useResumeProfile, useSession } from "@pinkslip/data";
import { Heading, Icon, Select, Separator, Stack, Surface, Text } from "../../kit";
import { usePushStatus, type PushStatus } from "../alerts/push";
import { profileSummary } from "../preferences/profile";
import { InlineFailure } from "../states/LoadStates";
import { setThemePreference, useThemePreference, type ThemePreference } from "../theme/theme";
import styles from "./You.module.css";

interface Row {
  to: "/admin" | "/you/preferences" | "/you/alerts" | "/you/companies" | "/you/resume" | "/you/tailoring" | "/you/answers" | "/you/feedback" | "/you/account";
  label: string;
  detail?: string;
  icon: PhosphorIcon;
}

function alertSummary(enabled: boolean | undefined, device: PushStatus | null): string | undefined {
  if (enabled === undefined || device === null) return undefined;
  const deviceNote: Partial<Record<PushStatus, string>> = {
    denied: "blocked in this browser", "requires-install": "add to Home Screen", unsupported: "not available here",
    promptable: "turn on for this device", disabled: "turn on for this device",
  };
  if (enabled) return device === "enabled" ? "On" : `On · ${deviceNote[device]}`;
  return "Off";
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <Stack as="section" gap="2">
    <Text size="xs" weight="semibold" tone="ink-4">{label}</Text>
    <Surface variant="list" bleedOnPhone as="ul">{children}</Surface>
  </Stack>;
}

function Rows({ rows }: { rows: Row[] }) {
  return rows.map((row, index) => <Fragment key={row.to}>
    {index > 0 && <li aria-hidden><Separator /></li>}
    <li>
      <Link to={row.to} className={styles.row}>
        <Icon icon={row.icon} size={20} />
        <span className={styles.copy}>
          <Text as="span" weight="medium">{row.label}</Text>
          {row.detail && <Text as="span" size="sm" tone="ink-3" truncate>{row.detail}</Text>}
        </span>
        <span className={styles.chevron}><Icon icon={CaretRight} size={16} weight="bold" /></span>
      </Link>
    </li>
  </Fragment>);
}

/** `Profile.svelte`'s overview: grouped rows, each with a one-line summary of
 * where that setting stands, plus Appearance. Support and Privacy stay off
 * for now (owner, 2026-10-10); their pages remain. */
export function You() {
  const session = useSession();
  const me = session.data?.me;
  const preferences = usePreferences();
  const push = usePushSettings();
  const resume = useResumeProfile();
  const { status: device } = usePushStatus();
  const theme = useThemePreference();
  const resumeData = resume.data?.data;
  const resumeReady = Boolean(resumeData?.contact.name || resumeData?.experience.length || resumeData?.education.length || resumeData?.projects.length);

  const search: Row[] = [
    { to: "/you/preferences", label: "Job preferences", icon: SlidersHorizontal,
      detail: preferences.data ? profileSummary(normalizeSearchProfile(preferences.data.search_profile)) : undefined },
    { to: "/you/alerts", label: "Job alerts", icon: Bell, detail: alertSummary(push.data?.enabled, device) },
    { to: "/you/companies", label: "Companies", icon: Buildings, detail: "Hidden companies and requests" },
  ];
  const materials: Row[] = [
    { to: "/you/resume", label: "Resume", icon: FileText, detail: resume.data ? (resumeReady ? "Ready" : "Add your resume") : undefined },
    { to: "/you/tailoring", label: "Tailoring", icon: Sparkle, detail: "Coming soon" },
    ...(me?.features?.auto_apply_enabled ? [{ to: "/you/answers", label: "Application answers", icon: ClipboardText, detail: "Reused on every application" } as const] : []),
  ];
  const signedIn = session.data?.state === "authenticated";

  return <Stack gap="6">
    <Stack gap="2">
      <Heading level={1} variant="root">You</Heading>
      {/* The session gate only renders this page once the session loaded, so
          an error here is a failed refresh; the last state stays below it. */}
      {session.isError && <InlineFailure title="Couldn't refresh your account"
        onRetry={() => void session.refetch()} retrying={session.isFetching} />}
    </Stack>
    <div className={styles.groups}>
      {me?.is_admin && <Group label="Admin"><Rows rows={[{ to: "/admin", label: "Admin workspace", detail: "Product health and moderation", icon: Wrench }]} /></Group>}
      <Group label="Search"><Rows rows={search} /></Group>
      <Group label="Materials"><Rows rows={materials} /></Group>
      <Group label="App">
        <li className={styles.row} data-static>
          <Icon icon={PaintBrush} size={20} />
          <span className={styles.copy}><Text as="span" weight="medium">Appearance</Text></span>
          <span className={styles.select}>
            <Select aria-label="Appearance" value={theme} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </span>
        </li>
        <li aria-hidden><Separator /></li>
        <Rows rows={[{ to: "/you/feedback", label: "Help and feedback", detail: "Ideas and problems", icon: ChatCircleDots }]} />
      </Group>
      <Group label="Account">
        <Rows rows={[{ to: "/you/account", label: "Account", icon: UserCircle,
          detail: signedIn ? (me?.account?.email ?? "Signed in") : "Guest · sign in to sync" }]} />
      </Group>
    </div>
  </Stack>;
}
