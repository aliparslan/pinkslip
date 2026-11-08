import { AdminOnly } from "../../../../../features/admin/parts";
import { RunsPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

export default function AdminRunsRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <RunsPage /> : <AdminOnly><RunsPage /></AdminOnly>;
}
