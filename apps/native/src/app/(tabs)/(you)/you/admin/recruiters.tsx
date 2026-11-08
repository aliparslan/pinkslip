import { AdminOnly } from "../../../../../features/admin/parts";
import { RecruitersPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

export default function AdminRecruitersRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <RecruitersPage /> : <AdminOnly><RecruitersPage /></AdminOnly>;
}
