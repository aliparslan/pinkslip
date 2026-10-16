import { Redirect } from "expo-router";
import { useRedesign } from "../../../../features/redesign/flag";
import { SkillsPage } from "../../../../features/redesign/resume/ResumePages";

/** A resume editor page; today's screens edit the resume in one place. */
export default function Screen() {
  if (!useRedesign()) return <Redirect href="/you/resume" />;
  return <SkillsPage />;
}
