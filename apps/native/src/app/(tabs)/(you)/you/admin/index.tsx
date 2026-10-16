import { Stack } from "expo-router";
import { AdminHome } from "../../../../../features/admin/AdminHome";
import { AdminOnly } from "../../../../../features/admin/parts";
import { AdminHomePage, SampleAdminHome, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

export default function AdminAdminHomeRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <SampleAdminHome /> : <AdminOnly><AdminHomePage /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Admin" }} />
    <AdminOnly><AdminHome /></AdminOnly>
  </>;
}
