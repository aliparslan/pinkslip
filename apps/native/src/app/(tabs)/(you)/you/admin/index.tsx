import { Stack } from "expo-router";
import { AdminHome } from "../../../../../features/admin/AdminHome";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminAdminHomeRoute() {
  return <>
    <Stack.Screen options={{ title: "Admin" }} />
    <AdminOnly><AdminHome /></AdminOnly>
  </>;
}
