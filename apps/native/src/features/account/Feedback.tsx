import { useSubmitFeedback } from "@pinkslip/data";
import { router } from "expo-router";
import { PaperPlaneTilt } from "phosphor-react-native";
import { useState } from "react";
import { Button, Field, Input, Screen, Stack, Textarea, toast, ToggleGroup } from "../../kit";

/** "Help and feedback": an idea or a problem, to the admin inbox. */
export function Feedback() {
  const submit = useSubmitFeedback();
  const [type, setType] = useState<"feature_request" | "general_feedback">("feature_request");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = () => {
    if (title.trim().length < 2) { setError("Add a short subject."); return; }
    submit.mutate({ type, title: title.trim(), details: details.trim() }, {
      onSuccess: (result) => { toast.success(result.duplicate ? "That one's already in the queue. Thanks!" : "Feedback sent. Thank you!"); router.back(); },
      onError: () => toast.error("Couldn't send your feedback. Try again."),
    });
  };
  return <Screen>
    <Stack gap="4">
      <ToggleGroup label="Type" value={type} onValueChange={setType} options={[{ value: "feature_request", label: "Idea" }, { value: "general_feedback", label: "Problem or other" }]} />
      <Field label="Subject" error={error}>
        <Input value={title} maxLength={160} placeholder={type === "feature_request" ? "What should Pinkslip do?" : "What happened?"}
          onChangeText={(text) => { setTitle(text); setError(null); }} returnKeyType="next" />
      </Field>
      <Field label="Details" optional><Textarea value={details} maxLength={2000} onChangeText={setDetails} /></Field>
      <Button variant="primary" fullWidth icon={PaperPlaneTilt} pending={submit.isPending} onPress={send}>Send feedback</Button>
    </Stack>
  </Screen>;
}
