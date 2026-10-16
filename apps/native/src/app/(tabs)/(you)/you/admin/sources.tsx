import { Stack } from "expo-router";
import { Sources } from "../../../../../features/admin/Sources";
import { AdminOnly } from "../../../../../features/admin/parts";
import { SourcesPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

export default function AdminSourcesRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <SourcesPage /> : <AdminOnly><SourcesPage /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Sources" }} />
    <AdminOnly><Sources /></AdminOnly>
  </>;
}
