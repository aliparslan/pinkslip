import { useMemo, useState } from "react";
import { ArrowCounterClockwise, Buildings, EyeSlash, Flag, Plus } from "@phosphor-icons/react";
import type { Company } from "@pinkslip/core/api";
import { companyCareersUrl } from "@pinkslip/domain/company-sources";
import { useCompanies, useReportCompany, useRequestCompany, useSetCompanyHidden } from "@pinkslip/data";
import {
  Button, Dialog, EmptyState, Field, Heading, IconButton, Input, SearchInput, Separator, Stack, Surface, Tabs, Text,
  Textarea, toast, UNDO_TOAST_DURATION,
} from "../../kit";
import { CompanyLogo } from "../jobs/CompanyLogo";
import { PageFailure, PageLoading } from "../states/LoadStates";
import styles from "./Companies.module.css";

export const COMPANY_PAGE_SIZE = 40;

type View = "all" | "hidden";

export const enabled = (company: Company) => Boolean(company.enabled);

/** Name or ATS slug contains the query. */
export function matchesQuery(company: Company, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || company.name.toLowerCase().includes(needle) || company.ats_slug.toLowerCase().includes(needle);
}

/** The company name, linked to its careers page when the source has one. */
export function CompanyName({ company }: { company: Company }) {
  const url = companyCareersUrl(company.ats_type, company.ats_slug);
  return url
    ? <a className={styles.name} href={url} target="_blank" rel="noopener noreferrer">{company.name}</a>
    : <span className={styles.name}>{company.name}</span>;
}

/** `Companies.svelte` (user mode): every company Pinkslip follows, with Hide
 * (Undo) and Report on each, and the hidden ones under their own tab with
 * Restore. A search with no exact match offers to request that company. */
export function Companies() {
  const companies = useCompanies();
  const setHidden = useSetCompanyHidden();
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(COMPANY_PAGE_SIZE);
  const [reporting, setReporting] = useState<Company | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const followed = useMemo(() => (companies.data ?? []).filter(enabled), [companies.data]);
  const hiddenCount = followed.filter((company) => company.blocked).length;
  const shown = followed.filter((company) => Boolean(company.blocked) === (view === "hidden") && matchesQuery(company, query));
  const candidate = query.trim();
  const offerRequest = view === "all" && candidate.length >= 2
    && !(companies.data ?? []).some((company) => company.name.trim().toLowerCase() === candidate.toLowerCase());

  const search = (value: string) => { setQuery(value); setLimit(COMPANY_PAGE_SIZE); };
  const hide = (company: Company, hidden: boolean) => setHidden.mutate({ id: company.id, hidden }, {
    onSuccess: () => {
      if (!hidden) return;
      toast.show({
        message: `${company.name} hidden from jobs`, duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => setHidden.mutate({ id: company.id, hidden: false }) },
      });
    },
    onError: () => toast.error(hidden ? "Couldn't hide that company. Try again." : "Couldn't restore that company. Try again."),
  });

  return <Stack gap="5">
    <Heading level={1} variant="screen">Companies</Heading>
    <Stack gap="3">
      <SearchInput aria-label="Search companies" placeholder="Search companies" value={query}
        onChange={(event) => search(event.target.value)} />
      <Tabs<View> label="Companies" value={view} onValueChange={(next) => { setView(next); setLimit(COMPANY_PAGE_SIZE); }} tabs={[
        { value: "all", label: "All" },
        { value: "hidden", label: "Hidden", count: hiddenCount || undefined },
      ]} />
    </Stack>

    {companies.isPending ? <PageLoading label="Loading companies" />
      : companies.isError && !companies.data
        ? <PageFailure title="Companies didn't load" onRetry={() => void companies.refetch()} retrying={companies.isFetching} />
      : shown.length === 0 && !offerRequest
        ? <EmptyState icon={view === "hidden" ? EyeSlash : Buildings} title={view === "hidden" ? "No hidden companies" : "No companies found"}
          message={view === "hidden" ? "Companies you hide from jobs show up here." : "Try a different name."} />
      : <Stack gap="4">
        <Surface variant="list" bleedOnPhone as="ul">
          {shown.slice(0, limit).map((company, index) => <li key={company.id} className={styles.item}>
            {index > 0 && <Separator />}
            <div className={styles.row}>
              <CompanyLogo name={company.name} domain={company.website} size={32} />
              <CompanyName company={company} />
              {company.blocked
                ? <Button variant="secondary" size="compact" icon={ArrowCounterClockwise} aria-label={`Restore ${company.name}`}
                  onClick={() => hide(company, false)}>Restore</Button>
                : <span className={styles.actions}>
                  <IconButton icon={Flag} label={`Report a problem with ${company.name}`} size="sm" iconSize={16} onClick={() => setReporting(company)} />
                  <IconButton icon={EyeSlash} label={`Hide ${company.name}`} size="sm" iconSize={16} onClick={() => hide(company, true)} />
                </span>}
            </div>
          </li>)}
          {offerRequest && <li className={styles.item}>
            {shown.length > 0 && <Separator />}
            <button type="button" className={styles.request} onClick={() => setRequesting(candidate)}>
              <span className={styles.copy}>
                <Text as="span" weight="medium">Request “{candidate}”</Text>
                <Text as="span" size="sm" tone="ink-3">Not seeing it? We'll look into adding it.</Text>
              </span>
              <Plus size={17} weight="bold" aria-hidden />
            </button>
          </li>}
        </Surface>
        {shown.length > limit && <div className={styles.more}>
          <Button variant="secondary" onClick={() => setLimit(limit + COMPANY_PAGE_SIZE)}>
            Show {Math.min(COMPANY_PAGE_SIZE, shown.length - limit)} more
          </Button>
        </div>}
      </Stack>}

    <ReportCompanyDialog company={reporting} onClose={() => setReporting(null)} />
    <RequestCompanyDialog name={requesting} onClose={() => setRequesting(null)} />
  </Stack>;
}

function ReportCompanyDialog({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const report = useReportCompany();
  const [notes, setNotes] = useState("");
  return <Dialog open={company !== null} onOpenChange={(open) => { if (!open) onClose(); }} size="sm" busy={report.isPending}
    title={company ? `Report ${company.name}` : "Report"}>
    <Stack gap="4">
      <Field label="What's wrong?" optional>
        <Textarea value={notes} maxLength={1000} placeholder="Jobs are missing or out of date" onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Button variant="primary" fullWidth pending={report.isPending} onClick={() => company && report.mutate({ companyId: company.id, notes: notes.trim() }, {
        onSuccess: () => { toast.success(`Report sent for ${company.name}`); setNotes(""); onClose(); },
        onError: () => toast.error("Couldn't send that report. Try again."),
      })}>Send report</Button>
    </Stack>
  </Dialog>;
}

function RequestCompanyDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  return <Dialog open={name !== null} onOpenChange={(open) => { if (!open) onClose(); }} size="sm" title="Request a company">
    {name !== null && <RequestCompanyForm key={name} initialName={name} onClose={onClose} />}
  </Dialog>;
}

function RequestCompanyForm({ initialName, onClose }: { initialName: string; onClose: () => void }) {
  const request = useRequestCompany();
  const [name, setName] = useState(initialName);
  const [careersUrl, setCareersUrl] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!name.trim()) { setError("Add the company's name."); return; }
    request.mutate({ name: name.trim(), careersUrl: careersUrl.trim(), details: details.trim() }, {
      onSuccess: (result) => {
        toast.success(result.duplicate ? "You've already requested that company" : "Company request sent");
        onClose();
      },
      onError: () => toast.error("Couldn't send that request. Try again."),
    });
  };
  return <Stack gap="4">
    <Field label="Company" error={error}>
      <Input value={name} maxLength={120} onChange={(event) => { setName(event.target.value); setError(null); }} />
    </Field>
    <Field label="Careers page" optional>
      <Input type="url" value={careersUrl} placeholder="https://" onChange={(event) => setCareersUrl(event.target.value)} />
    </Field>
    <Field label="Notes" optional>
      <Textarea value={details} maxLength={1000} onChange={(event) => setDetails(event.target.value)} />
    </Field>
    <Button variant="primary" fullWidth pending={request.isPending} onClick={submit}>Send request</Button>
  </Stack>;
}
