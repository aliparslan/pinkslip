import { Stack } from "expo-router";
import { Companies } from "../../../../features/companies/Companies";

export default function CompaniesScreen() {
  return <>
    <Stack.Screen options={{ title: "Companies" }} />
    <Companies />
  </>;
}
