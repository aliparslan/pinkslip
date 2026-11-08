import { useLocalSearchParams } from "expo-router";
import { SampleHiddenCompaniesPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { HiddenCompaniesPage } from "../../../../features/redesign/you/HiddenCompaniesPage";

/** You → Hidden companies (from Your search). The kit opens three sample ones
 * with `?sample=on`. */
export default function CompaniesScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (redesignKitAvailable && sample === "on") return <SampleHiddenCompaniesPage />;
  return <HiddenCompaniesPage />;
}
