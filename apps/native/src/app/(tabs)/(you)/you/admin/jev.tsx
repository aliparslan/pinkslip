import { AdminOnly } from "../../../../../features/admin/parts";
import { JevPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

export default function AdminJevRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <JevPage /> : <AdminOnly><JevPage /></AdminOnly>;
}
