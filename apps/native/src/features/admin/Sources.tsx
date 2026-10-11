import {
  friendlyPollError, matchesCompanyQuery, matchesSourceStatus, SOURCE_STATUSES, sourceNeedsAttention, type SourceStatus,
} from "@pinkslip/core/admin-format";
import type { Company } from "@pinkslip/core/api";
import {
  COMPANY_SOURCE_TYPES, companySourceInput, companySourceLabel, isPollableCompanySourceType,
  POLLABLE_COMPANY_SOURCE_TYPES, type PollableCompanySourceType,
} from "@pinkslip/domain/company-sources";
import {
  useCompanies, useCreateCompany, useDeleteCompany, usePollCompany, useToggleCompany, useUpdateCompany, useVerifySource,
} from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { Stack as RouterStack } from "expo-router";
import { Buildings, DotsThree } from "phosphor-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  Button, EmptyState, Field, IconButton, Inline, Input, Menu, Select, Sheet, Spinner, Stack, Switch, Text, toast, usePullToRefresh,
} from "../../kit";
import { CompanyLogo } from "../jobs/CompanyLogo";
import { Centered, Failure } from "./parts";

const PAGE_SIZE = 40;
const ALL = "all";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The web admin's Sources: every company source with its ATS, health and an
 * enable switch. Add, edit (then a one-off poll to check the fix), remove,
 * and verify a board before saving. */
export function Sources() {
  const companies = useCompanies();
  const toggle = useToggleCompany();
  const remove = useDeleteCompany();
  const pull = usePullToRefresh(() => companies.refetch());
  const [query, setQuery] = useState("");
  const [ats, setAts] = useState<string>(ALL);
  const [status, setStatus] = useState<SourceStatus>("active");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const all = companies.data ?? [];
  const shown = all.filter((company) => (ats === ALL || company.ats_type === ats) && matchesSourceStatus(company, status) && matchesCompanyQuery(company, query));
  const attention = all.filter(sourceNeedsAttention).length;
  const filter = (apply: () => void) => { apply(); setLimit(PAGE_SIZE); };

  const confirmRemove = (company: Company) => Alert.alert(`Remove ${company.name}?`, "Its jobs stop updating. Turning the source off keeps it for later instead.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => remove.mutate(company.id, {
      onSuccess: () => toast.success(`${company.name} removed`),
      onError: () => toast.error("Couldn't remove that source. Try again."),
    }) },
  ]);

  return <View style={styles.fill}>
    <RouterStack.Screen options={{
      headerSearchBarOptions: { placeholder: "Search sources", hideWhenScrolling: false, onChangeText: (event) => filter(() => setQuery(event.nativeEvent.text)) },
      unstable_headerRightItems: () => [{ type: "button", label: "Add source", icon: { type: "sfSymbol", name: "plus" }, onPress: () => setAdding(true) }],
    }} />
    {companies.isPending ? <Centered><Spinner label="Loading sources" /></Centered>
      : companies.isError && !companies.data ? <Centered><Failure title="Sources didn't load" onRetry={() => void companies.refetch()} retrying={companies.isFetching} /></Centered>
      : <FlashList data={shown.slice(0, limit)} keyExtractor={(company) => company.id} contentInsetAdjustmentBehavior="automatic"
        refreshing={pull.refreshing} onRefresh={pull.onRefresh}
        ListHeaderComponent={<View style={styles.header}>
          <Text size="sm" tone="ink-3">
            {all.filter((company) => company.enabled).length} active · {attention ? <Text size="sm" tone="bad">{`${attention} need attention · `}</Text> : null}{all.length} total
          </Text>
          <Inline gap="2">
            <View style={styles.filter}><Select label="Source" value={ats} onValueChange={(value) => filter(() => setAts(value))}
              options={[{ value: ALL, label: "All sources" }, ...COMPANY_SOURCE_TYPES.map((type) => ({ value: type, label: companySourceLabel(type) }))]} /></View>
            <View style={styles.filter}><Select<SourceStatus> label="Status" value={status} onValueChange={(value) => filter(() => setStatus(value))} options={SOURCE_STATUSES} /></View>
          </Inline>
          <Text size="xs" tone="ink-4">{shown.length} shown</Text>
        </View>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <SourceRow company={item}
          onToggle={(enabled) => toggle.mutate({ id: item.id, enabled }, { onError: () => toast.error("Couldn't update that source. Try again.") })}
          onEdit={() => setEditing(item)} onRemove={() => confirmRemove(item)} />}
        ListEmptyComponent={<EmptyState icon={Buildings} title="No sources found" message="Adjust the filters or add a source." />}
        ListFooterComponent={shown.length > limit ? <View style={styles.more}>
          <Button onPress={() => setLimit(limit + PAGE_SIZE)}>{`Show ${Math.min(PAGE_SIZE, shown.length - limit)} more`}</Button>
        </View> : null} />}
    <Sheet open={adding} onOpenChange={setAdding} title="Add a source">
      {adding && <AddSourceForm onDone={() => setAdding(false)} />}
    </Sheet>
    <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Edit source">
      {editing && <EditSourceForm key={editing.id} company={editing} onDone={() => setEditing(null)} />}
    </Sheet>
  </View>;
}

function SourceRow({ company, onToggle, onEdit, onRemove }: { company: Company; onToggle: (enabled: boolean) => void; onEdit: () => void; onRemove: () => void }) {
  const failing = sourceNeedsAttention(company);
  return <View style={styles.row}>
    <CompanyLogo name={company.name} domain={company.website} size={32} />
    <View style={styles.copy}>
      <Text weight="medium" truncate>{company.name}</Text>
      <Text size="sm" tone="ink-3" truncate>
        {companySourceLabel(company.ats_type)} · {company.ats_slug}
        {company.quarantined_at ? <Text size="sm" tone="bad" weight="medium"> · Paused</Text>
          : company.last_poll_status === "error" ? <Text size="sm" tone="bad" weight="medium"> · Error</Text> : null}
      </Text>
      {failing && company.last_poll_error ? <Text size="sm" tone="bad" lines={2}>
        {friendlyPollError(company.last_poll_error)}{company.quarantined_at ? ` · since ${shortDate(company.quarantined_at)}` : ""}
      </Text> : null}
    </View>
    <Switch label={`Enable ${company.name}`} checked={Boolean(company.enabled)} onCheckedChange={onToggle} />
    <Menu items={[
      { id: "edit", title: "Edit source", icon: "pencil", onSelect: onEdit },
      { id: "remove", title: "Remove source", icon: "trash", destructive: true, onSelect: onRemove },
    ]}>
      <IconButton icon={DotsThree} label={`More for ${company.name}`} size="sm" />
    </Menu>
  </View>;
}

/** "Verify" asks the API to read the board and reports what it found. */
function useVerification() {
  const verify = useVerifySource();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const run = (atsType: PollableCompanySourceType, slug: string) => {
    setResult(null);
    verify.mutate({ ats_type: atsType, ats_slug: slug.trim() }, {
      onSuccess: (outcome) => setResult(outcome.ok
        ? { ok: true, message: `${outcome.total_jobs ?? 0} jobs found${outcome.sample_jobs?.[0]?.title ? ` · ${outcome.sample_jobs[0].title}` : ""}` }
        : { ok: false, message: outcome.error ?? "Verification failed" }),
      onError: () => setResult({ ok: false, message: "Couldn't verify that source. Try again." }),
    });
  };
  const notice = result && <Text size="sm" tone={result.ok ? "good" : "bad"}>{result.message}</Text>;
  return { run, pending: verify.isPending, notice, reset: () => setResult(null) };
}

function SourceFields({ atsType, slug, onAtsType, onSlug, legacy }: {
  atsType: string; slug: string; onAtsType: (value: PollableCompanySourceType) => void; onSlug: (value: string) => void; legacy?: boolean;
}) {
  const input = companySourceInput(atsType);
  return <>
    <Field label="ATS" error={legacy ? "Choose a supported ATS to migrate this source." : undefined}>
      <Select<PollableCompanySourceType> label="ATS" value={isPollableCompanySourceType(atsType) ? atsType : ""} placeholder={`${companySourceLabel(atsType)} (legacy)`}
        onValueChange={onAtsType} options={POLLABLE_COMPANY_SOURCE_TYPES.map((type) => ({ value: type, label: companySourceLabel(type) }))} />
    </Field>
    <Field label={input.label}>
      <Input value={slug} placeholder={input.placeholder} onChangeText={onSlug} autoCapitalize="none" autoCorrect={false}
        keyboardType={input.type === "url" ? "url" : "default"} />
    </Field>
  </>;
}

function AddSourceForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCompany();
  const verification = useVerification();
  const [name, setName] = useState("");
  const [atsType, setAtsType] = useState<PollableCompanySourceType>("greenhouse");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const ready = name.trim() !== "" && slug.trim() !== "";
  const submit = () => create.mutate({ name: name.trim(), ats_type: atsType, ats_slug: slug.trim(), website: website.trim() || undefined }, {
    onSuccess: (created) => { toast.success(`${created.name} added`); onDone(); },
    onError: () => toast.error("Couldn't add that source. Try again."),
  });
  return <Stack gap="4">
    <Field label="Company name"><Input value={name} placeholder="Stripe" onChangeText={setName} /></Field>
    <SourceFields atsType={atsType} slug={slug} onAtsType={(value) => { setAtsType(value); verification.reset(); }} onSlug={(value) => { setSlug(value); verification.reset(); }} />
    <Field label="Website" optional>
      <Input value={website} placeholder="https://stripe.com" onChangeText={setWebsite} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
    </Field>
    {verification.notice}
    <Inline gap="2">
      <View style={styles.half}><Button fullWidth disabled={!slug.trim()} pending={verification.pending} onPress={() => verification.run(atsType, slug)}>Verify</Button></View>
      <View style={styles.half}><Button fullWidth variant="primary" disabled={!ready} pending={create.isPending} onPress={submit}>Add source</Button></View>
    </Inline>
  </Stack>;
}

function EditSourceForm({ company, onDone }: { company: Company; onDone: () => void }) {
  const update = useUpdateCompany();
  const poll = usePollCompany();
  const verification = useVerification();
  const [name, setName] = useState(company.name);
  const [atsType, setAtsType] = useState<string>(company.ats_type);
  const [slug, setSlug] = useState(company.ats_slug);
  const legacy = !isPollableCompanySourceType(atsType);
  const ready = name.trim() !== "" && slug.trim() !== "" && !legacy;

  const save = () => {
    if (!isPollableCompanySourceType(atsType)) return;
    const label = name.trim();
    update.mutate({ id: company.id, name: label, ats_type: atsType, ats_slug: slug.trim() }, {
      onSuccess: () => {
        onDone();
        const key = `company-poll-${company.id}`;
        toast.show({ message: `${label} saved · checking source`, tone: "info", duration: null, dedupeKey: key });
        poll.mutate(company.id, {
          onSuccess: (result) => result.last_poll_status === "error"
            ? toast.error(`${label} is still failing`, { duration: null, dedupeKey: key })
            : toast.success(`${label} fixed${result.new_jobs ? ` · ${result.new_jobs} new jobs` : ""}`, { dedupeKey: key }),
          onError: () => toast.error(`Couldn't check ${label}`, { dedupeKey: key }),
        });
      },
      onError: () => toast.error("Couldn't save that source. Try again."),
    });
  };

  return <Stack gap="4">
    <Field label="Name"><Input value={name} onChangeText={setName} /></Field>
    <SourceFields atsType={atsType} slug={slug} legacy={legacy}
      onAtsType={(value) => { setAtsType(value); verification.reset(); }} onSlug={(value) => { setSlug(value); verification.reset(); }} />
    {verification.notice}
    <Inline gap="2">
      <View style={styles.half}><Button fullWidth disabled={!slug.trim() || legacy} pending={verification.pending}
        onPress={() => isPollableCompanySourceType(atsType) && verification.run(atsType, slug)}>Verify</Button></View>
      <View style={styles.half}><Button fullWidth variant="primary" disabled={!ready} pending={update.isPending} onPress={save}>Save</Button></View>
    </Inline>
  </Stack>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.colors.bg },
  header: { gap: theme.space["3"], paddingHorizontal: theme.gutter, paddingTop: theme.space["2"], paddingBottom: theme.space["3"] },
  filter: { flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: theme.gutter + 32 + theme.space["3"], backgroundColor: theme.colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space["3"], paddingHorizontal: theme.gutter, paddingVertical: theme.space["3"] },
  copy: { flex: 1, gap: 2 },
  more: { alignItems: "center", paddingVertical: theme.space["6"] },
  half: { flex: 1 },
}));
