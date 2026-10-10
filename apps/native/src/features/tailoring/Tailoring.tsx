import { router } from "expo-router";
import { Sparkle } from "phosphor-react-native";
import { Button, EmptyState, Screen } from "../../kit";

/** Tailoring stays a coming-soon page until the feature is un-tabled (D7),
 * pointing to the resume it will work from. */
export function Tailoring() {
  return <Screen><EmptyState icon={Sparkle} title="Coming soon" message="Tailored resumes for each job, built from your resume."
    actions={<Button onPress={() => router.push("/you/resume")}>Open resume</Button>} /></Screen>;
}
