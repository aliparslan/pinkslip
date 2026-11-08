import { AdminOnly } from "../../../../../features/admin/parts";
import { AdminHomePage, SampleAdminHome, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

export default function AdminAdminHomeRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <SampleAdminHome /> : <AdminOnly><AdminHomePage /></AdminOnly>;
}
