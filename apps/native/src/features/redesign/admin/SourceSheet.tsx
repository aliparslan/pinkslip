import type { Company } from "@pinkslip/core/api";
import { useCreateCompany, usePollCompany, useUpdateCompany, useVerifySource } from "@pinkslip/data";
import {
  companySourceInput, companySourceLabel, isPollableCompanySourceType, POLLABLE_COMPANY_SOURCE_TYPES, type PollableCompanySourceType,
} from "@pinkslip/domain/company-sources";
import { Children, Fragment, useState, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu } from "../../../kit";
import { Button, Icon, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, Text, TextField, toast, useSheet } from "../../../ui";

/** A6's Add and Edit, in Pinkslip's sheet: the name, the ATS and its board,
 * then Verify beside the pink Add or Save. `company` set is Edit. */
export function SourceSheet({ open, company, onClosed }: { open: boolean; company?: Company | null; onClosed: () => void }) {
  return <SheetModal open={open} onClosed={onClosed}>
    {open ? <SourceStep company={company ?? null} /> : null}
  </SheetModal>;
}

function SourceStep({ company }: { company: Company | null }) {
  const sheet = useSheet();
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const poll = usePollCompany();
  const verify = useVerifySource();
  const [name, setName] = useState(company?.name ?? "");
  const [atsType, setAtsType] = useState<string>(company?.ats_type ?? "greenhouse");
  const [slug, setSlug] = useState(company?.ats_slug ?? "");
  const [website, setWebsite] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const legacy = !isPollableCompanySourceType(atsType);
  const ready = name.trim() !== "" && slug.trim() !== "" && !legacy;
  const input = companySourceInput(atsType);

  const run = () => {
    if (!isPollableCompanySourceType(atsType)) return;
    setResult(null);
    verify.mutate({ ats_type: atsType, ats_slug: slug.trim() }, {
      onSuccess: (outcome) => setResult(outcome.ok
        ? { ok: true, message: `${outcome.total_jobs ?? 0} jobs found${outcome.sample_jobs?.[0]?.title ? ` · ${outcome.sample_jobs[0].title}` : ""}` }
        : { ok: false, message: outcome.error ?? "Verification failed" }),
      onError: () => setResult({ ok: false, message: "Couldn't verify that source. Try again." }),
    });
  };
  const add = () => {
    if (!isPollableCompanySourceType(atsType)) return;
    create.mutate({ name: name.trim(), ats_type: atsType, ats_slug: slug.trim(), website: website.trim() || undefined }, {
      onSuccess: (created) => { toast.success(`${created.name} added`); sheet.close(); },
      onError: () => toast.error("Couldn't add that source. Try again."),
    });
  };
  const save = () => {
    if (!company || !isPollableCompanySourceType(atsType)) return;
    const label = name.trim();
    update.mutate({ id: company.id, name: label, ats_type: atsType, ats_slug: slug.trim() }, {
      onSuccess: () => {
        sheet.close();
        const key = `company-poll-${company.id}`;
        toast.show({ message: `${label} saved · checking source`, tone: "info", duration: null, dedupeKey: key });
        poll.mutate(company.id, {
          onSuccess: (outcome) => outcome.last_poll_status === "error"
            ? toast.error(`${label} is still failing`, { duration: null, dedupeKey: key })
            : toast.success(`${label} fixed${outcome.new_jobs ? ` · ${outcome.new_jobs} new jobs` : ""}`, { dedupeKey: key }),
          onError: () => toast.error(`Couldn't check ${label}`, { dedupeKey: key }),
        });
      },
      onError: () => toast.error("Couldn't save that source. Try again."),
    });
  };
  const changeAts = (value: PollableCompanySourceType) => {
    setAtsType(value);
    setResult(null);
  };
  const changeSlug = (value: string) => {
    setSlug(value);
    setResult(null);
  };

  return <SheetStep id={company ? `edit-${company.id}` : "add"}>
    <SheetHeader title={company ? "Edit source" : "Add a source"} />
    <View style={styles.fields}>
      <Group>
        <TextField label={company ? "Name" : "Company name"} value={name} onChangeText={setName} autoCapitalize="words" />
        <View style={styles.pickRow}>
          <Text flex>ATS</Text>
          <Menu title="" items={POLLABLE_COMPANY_SOURCE_TYPES.map((type) => ({
            id: type, title: companySourceLabel(type), checked: atsType === type, onSelect: () => changeAts(type),
          }))}>
            <View style={styles.pickValue} accessibilityRole="button" accessibilityLabel={`ATS, ${companySourceLabel(atsType)}`}>
              <Text tone="ink-3">{legacy ? `${companySourceLabel(atsType)} (legacy)` : companySourceLabel(atsType)}</Text>
              <Icon name="pick" size={12} tone="ink-4" />
            </View>
          </Menu>
        </View>
        <TextField label={input.label} value={slug} onChangeText={changeSlug} keyboardType={input.type === "url" ? "url" : "default"} autoCapitalize="none" />
        {company ? null : <TextField label="Website (optional)" value={website} onChangeText={setWebsite} keyboardType="url" />}
      </Group>
      {legacy ? <Text role="footnote" tone="bad">Choose a supported ATS to move this source over.</Text>
        : result ? <Text role="footnote" tone={result.ok ? "good" : "bad"}>{result.message}</Text> : null}
    </View>
    <View style={styles.buttons}>
      <View style={styles.half}><Button fullWidth disabled={!slug.trim() || legacy} pending={verify.isPending} onPress={run}>Verify</Button></View>
      <View style={styles.half}>
        <Button variant="primary" fullWidth disabled={!ready} pending={company ? update.isPending : create.isPending} onPress={company ? save : add}>
          {company ? "Save" : "Add source"}
        </Button>
      </View>
    </View>
  </SheetStep>;
}

/** The sheet's white group, a rule between its rows. */
function Group({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return <View style={styles.group}>
    {rows.map((row, index) => <Fragment key={index}>
      {index > 0 ? <View style={styles.rule} /> : null}
      {row}
    </Fragment>)}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fields: { gap: theme.ui.space["2"] },
  group: {
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["sheet-group"],
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  pickRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  pickValue: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], minHeight: 44 },
  buttons: { flexDirection: "row", gap: theme.ui.space["2"] },
  half: { flex: 1 },
}));
