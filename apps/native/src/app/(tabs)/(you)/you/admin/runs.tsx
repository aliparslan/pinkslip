import { Stack } from "expo-router";
import { Runs } from "../../../../../features/admin/Runs";
import { AdminOnly } from "../../../../../features/admin/parts";
import { RunsPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

export default function AdminRunsRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <RunsPage /> : <AdminOnly><RunsPage /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Runs" }} />
    <AdminOnly><Runs /></AdminOnly>
  </>;
}
