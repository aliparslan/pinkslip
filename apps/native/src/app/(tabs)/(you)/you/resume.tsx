import { Stack } from "expo-router";
import { Resume } from "../../../../features/resume/Resume";

export default function ResumeScreen() {
  return <>
    <Stack.Screen options={{ title: "Resume" }} />
    <Resume />
  </>;
}
