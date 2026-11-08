import { useLocalSearchParams } from "expo-router";
import { AdminOnly } from "../../../../../features/admin/parts";
import { InboxListPage, useAdminSample, type InboxKind } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

/** The Inbox is three lists, one per `kind` (Paper "Admin · Oct 16" A2). */
export default function AdminInboxRoute() {
  const { kind = "flagged" } = useLocalSearchParams<{ kind?: InboxKind }>();
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <InboxListPage kind={kind} /> : <AdminOnly><InboxListPage kind={kind} /></AdminOnly>;
}
