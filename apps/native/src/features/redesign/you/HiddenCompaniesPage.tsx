import { useCompanies, useSetCompanyHidden } from "@pinkslip/data";
import { Fragment, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, CompanyLogo, EmptyState, RowPlaceholders, Text, toast } from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";
import { YouPage } from "./Page";

export interface HiddenCompany {
  id: string;
  name: string;
  website?: string | null;
}

export interface HiddenCompaniesViewProps {
  companies: readonly HiddenCompany[] | undefined;
  failed?: boolean;
  onRetry?: () => void;
  onShow: (company: HiddenCompany) => Promise<void>;
}

/** Hidden companies (Paper "You · Oct 14", owner 2026-10-14), reached from
 * Your search: each with Show, which brings its jobs back. */
export function HiddenCompaniesView({ companies, failed = false, onRetry, onShow }: HiddenCompaniesViewProps) {
  const [showing, setShowing] = useState<string | null>(null);
  const show = (company: HiddenCompany) => {
    setShowing(company.id);
    onShow(company).catch(() => toast.error(`Couldn't show ${company.name}. Try again.`)).finally(() => setShowing(null));
  };
  if (!companies) {
    return <YouPage title="Hidden companies">
      {failed ? <EmptyState title="Hidden companies didn't load" message="Check your connection and try again."
        action={onRetry ? { label: "Try again", variant: "secondary", onPress: onRetry } : undefined} />
        : <RowPlaceholders rows={4} lines={1} />}
    </YouPage>;
  }
  return <YouPage title="Hidden companies">
    {companies.length === 0
      ? <EmptyState title="None hidden" message="Companies you hide show up here." />
      : <View style={styles.list}>
        <View>
          {companies.map((company, index) => <Fragment key={company.id}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <View style={styles.row}>
              <CompanyLogo name={company.name} uri={logoUri(company.website)} />
              <View style={styles.name}><Text weight="medium" lines={1}>{company.name}</Text></View>
              <Button size="small" pending={showing === company.id} accessibilityLabel={`Show ${company.name}`} onPress={() => show(company)}>Show</Button>
            </View>
          </Fragment>)}
        </View>
        <Text role="footnote" tone="ink-3">Their jobs stay out of Jobs, alerts and auto-apply.</Text>
      </View>}
  </YouPage>;
}

/** Hidden companies on the live account. */
export function HiddenCompaniesPage() {
  const companies = useCompanies();
  const setHidden = useSetCompanyHidden();
  const hidden = companies.data?.filter((company) => Boolean(company.blocked));
  return <HiddenCompaniesView companies={hidden} failed={companies.isError} onRetry={() => void companies.refetch()}
    onShow={async (company) => {
      await setHidden.mutateAsync({ id: company.id, hidden: false });
      toast.success(`${company.name} is back in Jobs`);
    }} />;
}

const styles = StyleSheet.create((theme) => ({
  list: { paddingHorizontal: theme.ui.size.gutter, gap: theme.ui.space["6"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  name: { flex: 1, minWidth: 0 },
  // Under the name, past the 40 logo and its 12 gap.
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 52, backgroundColor: theme.ui.color.separator },
}));
