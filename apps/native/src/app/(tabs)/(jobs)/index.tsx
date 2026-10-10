import { Stack } from "expo-router";
import { Feed } from "../../../features/feed/Feed";

export default function JobsScreen() {
  return <>
    <Stack.Screen options={{ title: "Jobs", headerLargeTitle: true }} />
    <Feed />
  </>;
}
