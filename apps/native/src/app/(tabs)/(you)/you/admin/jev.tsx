import { Stack } from "expo-router";
import { Jev } from "../../../../../features/admin/Jev";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminJevRoute() {
  return <>
    <Stack.Screen options={{ title: "Jev" }} />
    <AdminOnly><Jev /></AdminOnly>
  </>;
}
