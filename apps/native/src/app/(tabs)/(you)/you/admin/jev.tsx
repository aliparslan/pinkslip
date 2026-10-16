import { Stack } from "expo-router";
import { Jev } from "../../../../../features/admin/Jev";
import { AdminOnly } from "../../../../../features/admin/parts";
import { JevPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

export default function AdminJevRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <JevPage /> : <AdminOnly><JevPage /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Jev" }} />
    <AdminOnly><Jev /></AdminOnly>
  </>;
}
