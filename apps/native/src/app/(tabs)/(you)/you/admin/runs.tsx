import { Stack } from "expo-router";
import { Runs } from "../../../../../features/admin/Runs";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminRunsRoute() {
  return <>
    <Stack.Screen options={{ title: "Runs" }} />
    <AdminOnly><Runs /></AdminOnly>
  </>;
}
