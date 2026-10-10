import type { Company } from "@pinkslip/core/api";
import { useCompanies, useReportCompany, useRequestCompany, useSetCompanyHidden } from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { Stack as RouterStack } from "expo-router";
import { ArrowCounterClockwise, Buildings, DotsThree, EyeSlash, Plus, WarningCircle } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, Field, IconButton, Input, Menu, SegmentedControl, Sheet, Spinner, Text, Textarea, toast, UNDO_TOAST_DURATION } from "../../kit";
import { CompanyLogo } from "../jobs/CompanyLogo";

type CompanyView = "all" | "hidden";

const matches = (company: Company, query: string) => {
  const needle = query.trim().toLowerCase();
  return !needle || company.name.toLowerCase().includes(needle) || company.ats_slug.toLowerCase().includes(needle);
};

/** Companies (`Companies.svelte`, user mode): every company Pinkslip follows,
 * Hide (with Undo) and Report on each, the hidden ones under their own
 * segment with Restore. A search with no exact match offers a request. */
export function Companies() {
  const { theme } = useUnistyles();
  const companies = useCompanies();
  const setHidden = useSetCompanyHidden();
  const [view, setView] = useState<CompanyView>("all");
  const [query, setQuery] = useState("");
  const [reporting, setReporting] = useState<Company | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const followed = useMemo(() => (companies.data ?? []).filter((company) => Boolean(company.enabled)), [companies.data]);
  const hiddenCount = followed.filter((company) => company.blocked).length;
  const shown = followed.filter((company) => Boolean(company.blocked) === (view === "hidden") && matches(company, query));
  const candidate = query.trim();
  const offerRequest = view === "all" && candidate.length >= 2 && !(companies.data ?? []).some((company) => company.name.trim().toLowerCase() === candidate.toLowerCase());

  const hide = (company: Company, hidden: boolean) => setHidden.mutate({ id: company.id, hidden }, {
    onSuccess: () => { if (hidden) toast.show({ message: `${company.name} hidden from jobs`, duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => setHidden.mutate({ id: company.id, hidden: false }) } }); },
    onError: () => toast.error(hidden ? "Couldn't hide that company. Try again." : "Couldn't restore that company. Try again."),
  });

  return <View style={styles.fill}>
    <RouterStack.Screen options={{ headerSearchBarOptions: { placeholder: "Search companies", hideWhenScrolling: false, onChangeText: (event) => setQuery(event.nativeEvent.text) } }} />
    {companies.isPending ? <View style={styles.center}><Spinner label="Loading companies" /></View>
      : companies.isError && !companies.data ? <View style={styles.center}><EmptyState icon={WarningCircle} title="Companies didn't load"
        actions={<Button pending={companies.isFetching} onPress={() => void companies.refetch()}>Try again</Button>} /></View>
      : <FlashList data={shown} keyExtractor={(company) => company.id} contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={<View style={styles.header}>
          <SegmentedControl<CompanyView> value={view} onValueChange={setView}
            segments={[{ value: "all", label: "All" }, { value: "hidden", label: hiddenCount ? `Hidden ${hiddenCount}` : "Hidden" }]} />
        </View>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <View style={styles.row}>
          <CompanyLogo name={item.name} domain={item.website} size={32} />
          <View style={styles.name}><Text weight="medium" truncate>{item.name}</Text></View>
          {item.blocked ? <Button size="compact" icon={ArrowCounterClockwise} accessibilityLabel={`Restore ${item.name}`} onPress={() => hide(item, false)}>Restore</Button>
            : <>
              <IconButton icon={EyeSlash} label={`Hide ${item.name}`} size="sm" onPress={() => hide(item, true)} />
              <Menu items={[{ id: "report", title: "Report a problem", icon: "flag", onSelect: () => setReporting(item) }]}>
                <IconButton icon={DotsThree} label={`More for ${item.name}`} size="sm" />
              </Menu>
            </>}
        </View>}
        ListFooterComponent={offerRequest ? <Pressable accessibilityRole="button" onPress={() => setRequesting(candidate)} style={styles.request}>
          <View style={styles.name}><Text weight="medium" tone="accent">Request "{candidate}"</Text><Text size="sm" tone="ink-3">Not seeing it? We'll look into adding it.</Text></View>
          <Plus size={18} weight="bold" color={theme.colors.accent} />
        </Pressable> : null}
        ListEmptyComponent={offerRequest ? null : <EmptyState icon={view === "hidden" ? EyeSlash : Buildings}
          title={view === "hidden" ? "No hidden companies" : "No companies found"}
          message={view === "hidden" ? "Companies you hide from jobs show up here." : "Try a different name."} />} />}
    <ReportSheet company={reporting} onClose={() => setReporting(null)} />
    <RequestSheet name={requesting} onClose={() => setRequesting(null)} />
  </View>;
}

function ReportSheet({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const report = useReportCompany();
  const [notes, setNotes] = useState("");
  return <Sheet open={company !== null} onOpenChange={(open) => { if (!open) onClose(); }} title={company ? `Report ${company.name}` : "Report"}
    footer={<Button variant="primary" fullWidth pending={report.isPending} onPress={() => company && report.mutate({ companyId: company.id, notes: notes.trim() }, {
      onSuccess: () => { toast.success(`Report sent for ${company.name}`); setNotes(""); onClose(); },
      onError: () => toast.error("Couldn't send that report. Try again."),
    })}>Send report</Button>}>
    <Field label="What's wrong?" optional><Textarea value={notes} maxLength={1000} placeholder="Jobs are missing or out of date" onChangeText={setNotes} /></Field>
  </Sheet>;
}

function RequestSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const request = useRequestCompany();
  const [company, setCompany] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  if (name !== null && opened !== name) { setOpened(name); setCompany(name); setCareersUrl(""); setDetails(""); setError(null); }
  const submit = () => {
    if (!company.trim()) { setError("Add the company's name."); return; }
    request.mutate({ name: company.trim(), careersUrl: careersUrl.trim(), details: details.trim() }, {
      onSuccess: (result) => { toast.success(result.duplicate ? "You've already requested that company" : "Company request sent"); setOpened(null); onClose(); },
      onError: () => toast.error("Couldn't send that request. Try again."),
    });
  };
  return <Sheet open={name !== null} onOpenChange={(open) => { if (!open) { setOpened(null); onClose(); } }} title="Request a company"
    footer={<Button variant="primary" fullWidth pending={request.isPending} onPress={submit}>Send request</Button>}>
    <Field label="Company" error={error}><Input value={company} maxLength={120} onChangeText={(text) => { setCompany(text); setError(null); }} /></Field>
    <Field label="Careers page" optional><Input keyboardType="url" autoCapitalize="none" value={careersUrl} placeholder="https://" onChangeText={setCareersUrl} /></Field>
    <Field label="Notes" optional><Textarea value={details} maxLength={1000} onChangeText={setDetails} /></Field>
  </Sheet>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, justifyContent: "center" },
  header: { paddingHorizontal: theme.gutter, paddingTop: theme.space["2"], paddingBottom: theme.space["3"] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: theme.gutter + 32 + theme.space["3"], backgroundColor: theme.colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space["3"], paddingLeft: theme.gutter, paddingRight: theme.space["2"], minHeight: 56 },
  name: { flex: 1, gap: 2 },
  request: { flexDirection: "row", alignItems: "center", gap: theme.space["3"], paddingHorizontal: theme.gutter, paddingVertical: theme.space["4"] },
}));
