import { Stack, useLocalSearchParams } from "expo-router";
import { Companies } from "../../../../features/companies/Companies";
import { SampleHiddenCompaniesPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { HiddenCompaniesPage } from "../../../../features/redesign/you/HiddenCompaniesPage";

/** You → Hidden companies (from Your search). The redesign kit opens three
 * sample ones with `?sample=on`. */
export default function CompaniesScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const redesign = useRedesign();
  if (redesign && redesignKitAvailable && sample === "on") return <SampleHiddenCompaniesPage />;
  if (redesign) return <HiddenCompaniesPage />;
  return <>
    <Stack.Screen options={{ title: "Companies" }} />
    <Companies />
  </>;
}
