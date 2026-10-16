import { Stack } from "expo-router";
import { ProductHealth } from "../../../../../features/admin/ProductHealth";
import { AdminOnly } from "../../../../../features/admin/parts";
import { HealthPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

export default function AdminProducthealthRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <HealthPage /> : <AdminOnly><HealthPage /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Product health" }} />
    <AdminOnly><ProductHealth /></AdminOnly>
  </>;
}
