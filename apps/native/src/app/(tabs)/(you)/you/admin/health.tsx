import { Stack } from "expo-router";
import { ProductHealth } from "../../../../../features/admin/ProductHealth";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminProductHealthRoute() {
  return <>
    <Stack.Screen options={{ title: "Product health" }} />
    <AdminOnly><ProductHealth /></AdminOnly>
  </>;
}
