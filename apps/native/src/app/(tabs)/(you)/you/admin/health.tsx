import { AdminOnly } from "../../../../../features/admin/parts";
import { HealthPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

export default function AdminProducthealthRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <HealthPage /> : <AdminOnly><HealthPage /></AdminOnly>;
}
