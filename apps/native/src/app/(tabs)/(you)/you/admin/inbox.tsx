import { Stack, useLocalSearchParams } from "expo-router";
import { Inbox } from "../../../../../features/admin/Inbox";
import { AdminOnly } from "../../../../../features/admin/parts";
import { InboxListPage, useAdminSample, type InboxKind } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

/** Redesigned, the Inbox is three lists, one per `kind` (Paper "Admin · Oct 16" A2). */
export default function AdminInboxRoute() {
  const { kind = "flagged" } = useLocalSearchParams<{ kind?: InboxKind }>();
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <InboxListPage kind={kind} /> : <AdminOnly><InboxListPage kind={kind} /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Inbox" }} />
    <AdminOnly><Inbox /></AdminOnly>
  </>;
}
