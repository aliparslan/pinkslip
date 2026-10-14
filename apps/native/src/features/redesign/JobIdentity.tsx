import { router, useSegments } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CompanyLogo, Icon, Text } from "../../ui";
import { logoUri } from "../jobs/CompanyLogo";
import { plainText } from "./job-facts";

export interface JobIdentityProps {
  companyName: string;
  companyDomain?: string | null;
  /** Makes the logo and company name open the company's page. */
  companyId?: string | null;
  title: string;
  closed?: boolean;
}

/** The top of a job's page and an application's: the logo, the company (a
 * link to its page) and the title. */
export function JobIdentity({ companyName, companyDomain, companyId, title, closed = false }: JobIdentityProps) {
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const company = `${plainText(companyName)}${closed ? " · Closed" : ""}`;
  const openCompany = () => {
    if (companyId) router.push({ pathname: `/(tabs)/${tab}/companies/[companyId]` as "/(tabs)/(jobs)/companies/[companyId]", params: { companyId } });
  };
  return <View style={styles.identity}>
    <Pressable onPress={openCompany} disabled={!companyId} accessibilityLabel={`${plainText(companyName)}, company page`}>
      <CompanyLogo name={companyName} uri={logoUri(companyDomain)} size="page" />
    </Pressable>
    <View style={styles.heading}>
      {companyId
        ? <Pressable onPress={openCompany} accessibilityRole="link" hitSlop={6} style={({ pressed }) => [styles.company, pressed && styles.pressed]}>
          <Text role="subhead" weight="medium" tone="ink-2">{company}</Text>
          <Icon name="disclosure" size={11} tone="ink-3" />
        </Pressable>
        : <Text role="subhead" tone="ink-2">{company}</Text>}
      <Text role="title2" accessibilityRole="header">{plainText(title)}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  identity: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  company: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"], alignSelf: "flex-start" },
  pressed: { opacity: 0.5 },
  heading: { flex: 1, gap: 2 },
}));
