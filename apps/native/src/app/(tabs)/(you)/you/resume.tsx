import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { resumeSample } from "../../../../features/kit/resume-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { startResumeSample } from "../../../../features/redesign/resume/draft";
import { ResumePage } from "../../../../features/redesign/resume/ResumePages";
import { Resume } from "../../../../features/resume/Resume";

export default function ResumeScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  // The kit opens it on Jordan's sample, which is never saved.
  useState(() => { if (sample === "on" && redesignKitAvailable) startResumeSample(resumeSample()); });
  if (useRedesign()) return <ResumePage />;
  return <>
    <Stack.Screen options={{ title: "Resume" }} />
    <Resume />
  </>;
}
