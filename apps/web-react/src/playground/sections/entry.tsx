import { Button } from "@pinkslip/ui/button";
import { Field, Fieldset, Form, SearchInput, TextField } from "@pinkslip/ui/field";
import { OTPField } from "@pinkslip/ui/otp-field";
import { useState } from "react";
import { Group, Specimen } from "../specimen";

export function EntryGroup() {
  const [code, setCode] = useState("");

  return (
    <Group id="entry" title="Text entry">
      <Specimen
        name="Field"
        use="Labelled text entry. The label sits above a recessed box; focus rings it in pink, an error in red."
      >
        <div className="flex max-w-110 flex-col gap-4">
          <TextField
            label="Email"
            description="Alerts and sign-in codes go here."
            control={{ type: "email", placeholder: "you@school.edu", autoComplete: "email" }}
          />
          <TextField
            label="Target title"
            invalid
            error="Add at least one title so we know what to match."
            control={{ placeholder: "Software Engineer, New Grad" }}
          />
          <TextField
            label="Master story"
            multiline
            description="The accomplishments tailoring draws from. Keep one current version."
            control={{
              defaultValue:
                "Built a real-time job alert pipeline on Cloudflare Workers that polls 2,400 career sites every few minutes.",
            }}
          />
        </div>
      </Specimen>

      <Specimen name="Input" use="The same box without a label, for search and filters.">
        <SearchInput placeholder="Search new-grad jobs" aria-label="Search jobs" className="max-w-110" />
      </Specimen>

      <Specimen name="Form and Fieldset" use="Groups fields and runs validation when the form is submitted.">
        <Form
          className="max-w-110"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Fieldset.Root>
            <Fieldset.Legend>Where should alerts go?</Fieldset.Legend>
            <Field.Root name="alertEmail">
              <Field.Label>Alert email</Field.Label>
              <Field.Control type="email" required placeholder="you@school.edu" />
              <Field.Error match="valueMissing">Enter an email for alerts.</Field.Error>
              <Field.Error match="typeMismatch">Enter a full email address, like you@school.edu.</Field.Error>
            </Field.Root>
          </Fieldset.Root>
          <div>
            <Button type="submit" variant="primary">
              Save alerts
            </Button>
          </div>
        </Form>
      </Specimen>

      <Specimen name="OTP Field" use="The six-digit sign-in code we email instead of a password.">
        <div className="flex flex-col gap-2">
          <span id="otp-label" className="text-ui font-medium text-ink">
            Sign-in code
          </span>
          <OTPField.Root length={6} value={code} onValueChange={setCode} aria-labelledby="otp-label">
            {Array.from({ length: 6 }, (_, index) => (
              <OTPField.Input key={index} />
            ))}
          </OTPField.Root>
          <span className="text-meta text-ink-3">Sent to you@school.edu. It expires in 10 minutes.</span>
        </div>
      </Specimen>
    </Group>
  );
}
