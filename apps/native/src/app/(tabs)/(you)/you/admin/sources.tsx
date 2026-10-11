import { Stack } from "expo-router";
import { Sources } from "../../../../../features/admin/Sources";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminSourcesRoute() {
  return <>
    <Stack.Screen options={{ title: "Sources" }} />
    <AdminOnly><Sources /></AdminOnly>
  </>;
}
