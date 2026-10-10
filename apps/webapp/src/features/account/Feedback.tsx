import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useSubmitFeedback } from "@pinkslip/data";
import { Button, Field, Heading, Input, Select, Stack, Textarea, toast } from "../../kit";

/** "Help and feedback": an idea or a problem, sent to the admin inbox. A
 * successful send goes back to You; a failure keeps the draft. */
export function Feedback() {
  const navigate = useNavigate();
  const submit = useSubmitFeedback();
  const [type, setType] = useState<"feature_request" | "general_feedback">("feature_request");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  return <Stack gap="6">
    <Heading level={1} variant="screen">Help and feedback</Heading>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      if (title.trim().length < 2) {
        setError("Add a short subject.");
        return;
      }
      submit.mutate({ type, title: title.trim(), details: details.trim() }, {
        onSuccess: (result) => {
          toast.success(result.duplicate ? "That one's already in the queue. Thanks!" : "Feedback sent. Thank you!");
          void navigate({ to: "/you" });
        },
        onError: () => toast.error("Couldn't send your feedback. Try again."),
      });
    }}>
      <Stack gap="4">
        <Field label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="feature_request">Idea</option>
            <option value="general_feedback">Problem or other feedback</option>
          </Select>
        </Field>
        <Field label="Subject" error={error}>
          <Input value={title} maxLength={160}
            placeholder={type === "feature_request" ? "What should Pinkslip do?" : "What happened?"}
            onChange={(event) => { setTitle(event.target.value); setError(null); }} />
        </Field>
        <Field label="Details" optional>
          <Textarea value={details} maxLength={2000} onChange={(event) => setDetails(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" fullWidth icon={PaperPlaneTilt} pending={submit.isPending}>Send feedback</Button>
      </Stack>
    </form>
  </Stack>;
}
