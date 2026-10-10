import { useState } from "react";
import { DotsThreeVertical, PencilSimple, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import type { Company } from "@pinkslip/core/api";
import {
  COMPANY_SOURCE_TYPES, companySourceInput, companySourceLabel, isPollableCompanySourceType,
  POLLABLE_COMPANY_SOURCE_TYPES, type PollableCompanySourceType,
} from "@pinkslip/domain/company-sources";
import {
  useCompanies, useCreateCompany, useDeleteCompany, usePollCompany, useToggleCompany, useUpdateCompany, useVerifySource,
} from "@pinkslip/data";
import {
  Alert, AlertDialog, Button, Dialog, EmptyState, Field, Heading, Input, Menu, MenuItem, SearchInput, Select, Separator,
  Stack, Surface, Switch, Text, toast,
} from "../../kit";
import { CompanyLogo } from "../jobs/CompanyLogo";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { COMPANY_PAGE_SIZE, CompanyName, matchesQuery } from "./Companies";
import styles from "./Companies.module.css";

type Status = "active" | "attention" | "disabled" | "all";
const STATUSES: { value: Status; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "attention", label: "Needs attention" },
  { value: "disabled", label: "Disabled" },
  { value: "all", label: "Any status" },
];

const needsAttention = (company: Company) => company.last_poll_status === "error" || Boolean(company.quarantined_at);

function matchesStatus(company: Company, status: Status): boolean {
  if (status === "active") return Boolean(company.enabled);
  if (status === "disabled") return !company.enabled;
  if (status === "attention") return needsAttention(company);
  return true;
}

export function friendlyPollError(value: string): string {
  return value
    .replace(/Request timed out after (\d+)ms/gi, (_match, ms: string) => `Timed out after ${Math.round(Number(ms) / 1000)} sec`)
    .replace(/\s+/g, " ")
    .trim();
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** `Companies.svelte` (admin mode): every source with its ATS, health and an
 * enable switch; add, edit (then a one-off poll to check the fix), remove,
 * and verify a slug before saving. */
export function Sources() {
  const companies = useCompanies();
  const toggle = useToggleCompany();
  const [query, setQuery] = useState("");
  const [ats, setAts] = useState<string>("all");
  const [status, setStatus] = useState<Status>("active");
  const [limit, setLimit] = useState(COMPANY_PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [removing, setRemoving] = useState<Company | null>(null);

  const all = companies.data ?? [];
  const shown = all.filter((company) => (ats === "all" || company.ats_type === ats) && matchesStatus(company, status) && matchesQuery(company, query));
  const filter = (apply: () => void) => { apply(); setLimit(COMPANY_PAGE_SIZE); };
  const attention = all.filter(needsAttention).length;

  return <Stack gap="5">
    <Heading level={1} variant="screen">Sources</Heading>
    {companies.data && <div className={styles.summary} aria-label="Source status">
      <span><strong>{all.filter((company) => company.enabled).length}</strong> active</span>
      {attention > 0 && <span className={styles.attention}><strong>{attention}</strong> need attention</span>}
      <span>{all.length} total</span>
    </div>}
    <Stack gap="3">
      <div className={styles.toolbar}>
        <SearchInput aria-label="Search sources" placeholder="Search sources" value={query} onChange={(event) => filter(() => setQuery(event.target.value))} />
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add source</Button>
      </div>
      <div className={styles.filters}>
        <Field label="Source">
          <Select value={ats} onChange={(event) => filter(() => setAts(event.target.value))}>
            <option value="all">All sources</option>
            {COMPANY_SOURCE_TYPES.map((type) => <option key={type} value={type}>{companySourceLabel(type)}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => filter(() => setStatus(event.target.value as Status))}>
            {STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        {companies.data && <span className={styles.count}>{shown.length} shown</span>}
      </div>
    </Stack>

    {companies.isPending ? <PageLoading label="Loading sources" />
      : companies.isError && !companies.data
        ? <PageFailure title="Sources didn't load" onRetry={() => void companies.refetch()} retrying={companies.isFetching} />
      : shown.length === 0 ? <EmptyState title="No sources found" message="Adjust the filters or add a source." />
      : <Stack gap="4">
        <Surface variant="list" bleedOnPhone as="ul">
          {shown.slice(0, limit).map((company, index) => <li key={company.id} className={styles.item}>
            {index > 0 && <Separator />}
            <SourceRow company={company}
              onToggle={(enabled) => toggle.mutate({ id: company.id, enabled }, { onError: () => toast.error("Couldn't update that source. Try again.") })}
              onEdit={() => setEditing(company)} onRemove={() => setRemoving(company)} />
          </li>)}
        </Surface>
        {shown.length > limit && <div className={styles.more}>
          <Button variant="secondary" onClick={() => setLimit(limit + COMPANY_PAGE_SIZE)}>Show {Math.min(COMPANY_PAGE_SIZE, shown.length - limit)} more</Button>
        </div>}
      </Stack>}

    <Dialog open={adding} onOpenChange={setAdding} title="Add a source" size="sm">
      {adding && <AddSourceForm onDone={() => setAdding(false)} />}
    </Dialog>
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Edit source" size="sm">
      {editing && <EditSourceForm key={editing.id} company={editing} onDone={() => setEditing(null)} />}
    </Dialog>
    <RemoveSource company={removing} onClose={() => setRemoving(null)} />
  </Stack>;
}

function SourceRow({ company, onToggle, onEdit, onRemove }: {
  company: Company;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const failing = needsAttention(company);
  return <div className={styles.row}>
    <CompanyLogo name={company.name} domain={company.website} size={32} />
    <span className={styles.copy}>
      <CompanyName company={company} />
      <span className={styles.meta}>
        <span>{companySourceLabel(company.ats_type)}</span>
        <span className={styles.slug} title={company.ats_slug}>{company.ats_slug}</span>
        {company.quarantined_at ? <Text as="span" size="sm" tone="bad" weight="medium">Paused</Text>
          : company.last_poll_status === "error" ? <Text as="span" size="sm" tone="bad" weight="medium">Error</Text> : null}
      </span>
      {failing && company.last_poll_error && <span className={styles.error} title={company.last_poll_error}>
        <WarningCircle size={14} weight="fill" aria-hidden />
        <Text as="span" size="sm" tone="bad" truncate>
          {friendlyPollError(company.last_poll_error)}{company.quarantined_at ? ` · since ${shortDate(company.quarantined_at)}` : ""}
        </Text>
      </span>}
    </span>
    <span className={styles.actions}>
      <Switch label={`Enable ${company.name}`} checked={Boolean(company.enabled)} onCheckedChange={onToggle} />
      <Menu trigger={{ icon: DotsThreeVertical, label: `More actions for ${company.name}`, size: "sm" }}>
        <MenuItem icon={PencilSimple} onSelect={onEdit}>Edit source</MenuItem>
        <MenuItem icon={Trash} tone="danger" onSelect={onRemove}>Remove source</MenuItem>
      </Menu>
    </span>
  </div>;
}

/** "Verify": asks the API to read the board and reports what it found. */
function useVerification() {
  const verify = useVerifySource();
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const run = (atsType: PollableCompanySourceType, slug: string) => {
    setResult(null);
    verify.mutate({ ats_type: atsType, ats_slug: slug.trim() }, {
      onSuccess: (outcome) => setResult(outcome.ok
        ? { tone: "success", message: `${outcome.total_jobs ?? 0} jobs found${outcome.sample_jobs?.[0]?.title ? ` · ${outcome.sample_jobs[0].title}` : ""}` }
        : { tone: "error", message: outcome.error ?? "Verification failed" }),
      onError: () => setResult({ tone: "error", message: "Couldn't verify that source. Try again." }),
    });
  };
  const notice = result && <Alert tone={result.tone} size="compact">{result.message}</Alert>;
  return { run, pending: verify.isPending, notice, reset: () => setResult(null) };
}

function SourceFields({ atsType, slug, onAtsType, onSlug, legacy }: {
  atsType: string;
  slug: string;
  onAtsType: (value: PollableCompanySourceType) => void;
  onSlug: (value: string) => void;
  legacy?: boolean;
}) {
  const input = companySourceInput(atsType);
  return <div className={styles.pair}>
    <Field label="ATS" error={legacy ? "Choose a supported ATS to migrate this source." : undefined}>
      <Select value={atsType} onChange={(event) => onAtsType(event.target.value as PollableCompanySourceType)}>
        {legacy && <option value={atsType} disabled>{companySourceLabel(atsType)} (legacy)</option>}
        {POLLABLE_COMPANY_SOURCE_TYPES.map((type) => <option key={type} value={type}>{companySourceLabel(type)}</option>)}
      </Select>
    </Field>
    <Field label={input.label}>
      <Input type={input.type} value={slug} placeholder={input.placeholder} onChange={(event) => onSlug(event.target.value)} />
    </Field>
  </div>;
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
    <Field label="Company name">
      <Input value={name} placeholder="Stripe" onChange={(event) => setName(event.target.value)} />
    </Field>
    <SourceFields atsType={atsType} slug={slug} onAtsType={(value) => { setAtsType(value); verification.reset(); }}
      onSlug={(value) => { setSlug(value); verification.reset(); }} />
    <Field label="Website" optional>
      <Input type="url" value={website} placeholder="https://stripe.com" onChange={(event) => setWebsite(event.target.value)} />
    </Field>
    {verification.notice}
    <div className={styles.pair}>
      <Button variant="secondary" disabled={!slug.trim()} pending={verification.pending} onClick={() => verification.run(atsType, slug)}>Verify</Button>
      <Button variant="primary" disabled={!ready} pending={create.isPending} onClick={submit}>Add source</Button>
    </div>
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
    <Field label="Name">
      <Input value={name} onChange={(event) => setName(event.target.value)} />
    </Field>
    <SourceFields atsType={atsType} slug={slug} legacy={legacy}
      onAtsType={(value) => { setAtsType(value); verification.reset(); }} onSlug={(value) => { setSlug(value); verification.reset(); }} />
    {verification.notice}
    <div className={styles.pair}>
      <Button variant="secondary" disabled={!slug.trim() || legacy} pending={verification.pending}
        onClick={() => isPollableCompanySourceType(atsType) && verification.run(atsType, slug)}>Verify</Button>
      <Button variant="primary" disabled={!ready} pending={update.isPending} onClick={save}>Save</Button>
    </div>
  </Stack>;
}

function RemoveSource({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const remove = useDeleteCompany();
  return <AlertDialog open={company !== null} onOpenChange={(open) => { if (!open) onClose(); }} tone="danger"
    title={company ? `Remove ${company.name}?` : "Remove source?"}
    description="Its jobs stop updating. Turning the source off keeps it for later instead."
    confirmLabel="Remove" pending={remove.isPending}
    onConfirm={() => company && remove.mutate(company.id, {
      onSuccess: () => { toast.success(`${company.name} removed`); onClose(); },
      onError: () => toast.error("Couldn't remove that source. Try again."),
    })} />;
}
