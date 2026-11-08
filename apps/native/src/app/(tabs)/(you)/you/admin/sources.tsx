import { AdminOnly } from "../../../../../features/admin/parts";
import { SourcesPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

export default function AdminSourcesRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <SourcesPage /> : <AdminOnly><SourcesPage /></AdminOnly>;
}
