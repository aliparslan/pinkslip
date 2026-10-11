import { Stack } from "expo-router";
import { Inbox } from "../../../../../features/admin/Inbox";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminInboxRoute() {
  return <>
    <Stack.Screen options={{ title: "Inbox" }} />
    <AdminOnly><Inbox /></AdminOnly>
  </>;
}
