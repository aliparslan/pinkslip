import { AdminOnly } from "../../../../../features/admin/parts";
import { RecruiterCompaniesPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable } from "../../../../../features/redesign/flag";

/** Admin → Recruiters → +: choose the companies to search (Paper R3). */
export default function AdminRecruiterCompaniesRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  return sample ? <RecruiterCompaniesPage /> : <AdminOnly><RecruiterCompaniesPage /></AdminOnly>;
}
