import { useRef, useState } from "react";
import { ApiError } from "@pinkslip/core/api";
import { useUnlockAccess } from "@pinkslip/data";
import { Button, Field, Form, Heading, Input, Stack, Surface, Text } from "../../kit";
import styles from "./Session.module.css";

/** The shared access code (the invite gate). Shown in place of personal
 * pages while the deployment requires a code this browser hasn't entered;
 * the public catalog stays readable. */
export function AccessGate() {
  const unlock = useUnlockAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (unlock.isPending) return;
    if (!code.trim()) {
      setError("Enter the shared access code.");
      input.current?.focus();
      return;
    }
    setError(null);
    unlock.mutate(code.trim(), {
      onError: (failure) => {
        setError(failure instanceof ApiError && failure.status === 401
          ? "That code didn't match."
          : failure instanceof Error ? failure.message : "Couldn't unlock Pinkslip.");
        input.current?.focus();
      },
    });
  };

  return <div className={styles.gate}>
    <Surface variant="card">
      <Stack gap="5">
        <Stack gap="2">
          <Heading level={1} variant="display-lg">Enter the shared code</Heading>
          <Text tone="ink-3">Pinkslip is invite-only for now. Enter the access code you were given to open your jobs and settings.</Text>
        </Stack>
        <Form aria-label="Unlock Pinkslip" onSubmit={submit}>
          <Field label="Access code" error={error}>
            <Input ref={input} type="password" name="access-code" placeholder="Enter code" autoComplete="off"
              autoCapitalize="off" spellCheck={false} autoFocus value={code}
              onChange={(event) => { setCode(event.target.value); setError(null); }} />
          </Field>
          <Button type="submit" variant="primary" fullWidth pending={unlock.isPending}>
            {unlock.isPending ? "Checking…" : "Unlock"}
          </Button>
        </Form>
      </Stack>
    </Surface>
  </div>;
}
