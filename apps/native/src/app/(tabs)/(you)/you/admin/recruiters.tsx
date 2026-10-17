import { Stack } from "expo-router";
import { Recruiters } from "../../../../../features/admin/Recruiters";
import { AdminOnly } from "../../../../../features/admin/parts";
import { RecruitersPage, useAdminSample } from "../../../../../features/redesign/admin/AdminPages";
import { redesignKitAvailable, useRedesign } from "../../../../../features/redesign/flag";

export default function AdminRecruitersRoute() {
  const sample = useAdminSample() && redesignKitAvailable;
  if (useRedesign()) return sample ? <RecruitersPage /> : <AdminOnly><RecruitersPage /></AdminOnly>;
  return <>
    <Stack.Screen options={{ title: "Recruiters" }} />
    <AdminOnly><Recruiters /></AdminOnly>
  </>;
}
