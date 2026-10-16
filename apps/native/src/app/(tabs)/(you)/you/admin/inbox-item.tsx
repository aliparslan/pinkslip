import { useLocalSearchParams } from "expo-router";
import { AdminOnly } from "../../../../../features/admin/parts";
import { InboxItemPage, useAdminSample, type InboxKind } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

/** One inbox entry, then the next (Paper "Admin · Oct 16" A3). */
export default function AdminInboxItemRoute() {
  const { kind = "flagged", id = "" } = useLocalSearchParams<{ kind?: InboxKind; id?: string }>();
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <InboxItemPage kind={kind} id={id} /> : <AdminOnly><InboxItemPage kind={kind} id={id} /></AdminOnly>;
}
