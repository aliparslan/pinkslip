import { Stack } from "expo-router";
import { Recruiters } from "../../../../../features/admin/Recruiters";
import { AdminOnly } from "../../../../../features/admin/parts";

export default function AdminRecruitersRoute() {
  return <>
    <Stack.Screen options={{ title: "Recruiters" }} />
    <AdminOnly><Recruiters /></AdminOnly>
  </>;
}
