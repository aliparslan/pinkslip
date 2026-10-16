import { useLocalSearchParams } from "expo-router";
import { CompanyPage } from "../../../../features/redesign/CompanyPage";

export default function CompanyScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  return <CompanyPage companyId={companyId} />;
}
