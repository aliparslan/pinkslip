import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppleLogo, EnvelopeSimple } from "@phosphor-icons/react";
import { useDeleteAccount, useSession, useSignOut, useStartEmailLogin, useUpdateName } from "@pinkslip/data";
import { Alert, AlertDialog, Badge, Button, Field, Heading, Input, SaveStatus, Stack, Surface, Text, toast } from "../../kit";
import { useAutosave } from "../settings/useAutosave";
import { clearResumeFile } from "../resume/resume-file";
import settings from "../settings/Settings.module.css";
import styles from "./Account.module.css";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** `AccountSection.svelte` plus the display name: who you are, email sign-in
 * for guests, and log out / delete / start over. Apple redirects through Hono
 * when the website's Services ID and server credentials are configured. */
export function Account() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const signedIn = session?.state === "authenticated";
  const hasSession = signedIn || session?.state === "guest";
  const account = session?.me?.account;
  const { apple } = useSearch({ from: "/you/account" });
  const handledApple = useRef<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<"logout" | "restart" | "delete" | null>(null);
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();

  useEffect(() => {
    if (!apple || handledApple.current === apple) return;
    handledApple.current = apple;
    if (apple === "success") toast.success("Signed in with Apple");
    else if (apple === "error") toast.error("Apple sign-in didn't finish. Try again.");
    else if (apple === "unavailable") toast.error("Apple sign-in is temporarily unavailable. Use email or try again later.");
    void navigate({ to: "/you/account", search: (previous) => ({ ...previous, apple: undefined }), replace: true });
  }, [apple, navigate]);

  return <Stack gap="6">
    <Heading level={1} variant="screen">Account</Heading>
    {hasSession && <NameCard initial={session?.me?.user?.name ?? ""} />}

    <Surface variant="card">
      {signedIn ? <Stack gap="4">
        <div className={settings.titleRow}>
          <Stack gap="1">
            <Text weight="medium">Signed in</Text>
            <Text size="sm" tone="ink-3">
              {account?.email ?? "Your account is active"}{account?.provider && ` · ${account.provider === "apple" ? "Apple" : "email"}`}
            </Text>
          </Stack>
          <Badge>Synced</Badge>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setConfirm("logout")}>Log out</Button>
          <Button variant="danger" onClick={() => setConfirm("delete")}>Delete account</Button>
        </div>
      </Stack> : <EmailSignIn appleEnabled={session?.me?.features?.web_apple_sign_in_enabled ?? false} onRestart={hasSession ? () => setConfirm("restart") : undefined} />}
    </Surface>

    <AlertDialog
      open={confirm === "logout" || confirm === "restart"}
      onOpenChange={(open) => { if (!open) setConfirm(null); }}
      title={confirm === "restart" ? "Start over?" : "Log out?"}
      description={confirm === "restart"
        ? "This starts a fresh guest profile. Your current saved jobs and preferences won't come with you."
        : "You'll be signed out on this device. Your account stays saved."}
      confirmLabel={confirm === "restart" ? "Start over" : "Log out"}
      tone={confirm === "restart" ? "danger" : "primary"}
      pending={signOut.isPending}
      onConfirm={() => signOut.mutate(undefined, {
        onSuccess: () => {
          // The imported PDF on this device belongs to the person leaving.
          void clearResumeFile();
          const restarting = confirm === "restart";
          setConfirm(null);
          toast.success(restarting ? "Started over" : "Signed out");
          void navigate({ to: restarting ? "/welcome" : "/" });
        },
        onError: () => toast.error("Couldn't sign out. Try again."),
      })}
    />
    <AlertDialog
      open={confirm === "delete"}
      onOpenChange={(open) => { if (!open) setConfirm(null); }}
      title="Delete your account?"
      description="This permanently deletes your account, saved jobs, applications and resume. It can't be undone."
      confirmLabel="Delete account"
      tone="danger"
      pending={deleteAccount.isPending}
      onConfirm={() => deleteAccount.mutate(undefined, {
        onSuccess: (response) => {
          void clearResumeFile();
          setConfirm(null);
          toast.success(response.apple_revoke_required
            ? "Account deleted. Remove Pinkslip under Sign in with Apple in your Apple ID settings to finish."
            : "Account deleted. You can keep browsing as a guest.", { duration: 8000 });
        },
        onError: () => toast.error("Couldn't delete your account. Try again."),
      })}
    />
  </Stack>;
}

function NameCard({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const updateName = useUpdateName();
  const trimmed = name.trim();
  const autosave = useAutosave({
    value: trimmed,
    ready: true,
    save: (next) => (next ? updateName.mutateAsync(next) : Promise.resolve()),
  });
  return <Surface variant="card">
    <Stack gap="2">
      <div className={settings.titleRow}>
        <Text size="sm" weight="medium" tone="ink-2">Name</Text>
        <SaveStatus phase={autosave.phase} onRetry={autosave.retry} />
      </div>
      <Input aria-label="Name" autoComplete="name" placeholder="Your name" value={name} maxLength={80}
        onChange={(event) => setName(event.target.value)} />
    </Stack>
  </Surface>;
}

function EmailSignIn({ onRestart, appleEnabled }: { onRestart?: () => void; appleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const start = useStartEmailLogin();
  const resend = sentTo !== null && sentTo.toLowerCase() === email.trim().toLowerCase();

  return <Stack gap="4">
    <Stack gap="1">
      <Text weight="medium">Browsing as a guest</Text>
      <Text size="sm" tone="ink-3">Sign in to keep your jobs and preferences on every device.</Text>
    </Stack>
    {appleEnabled && <form method="post" action="/api/v2/auth/apple/web/start">
      <Button type="submit" variant="secondary" icon={AppleLogo} fullWidth>Sign in with Apple</Button>
    </form>}
    <form className={styles.emailForm} noValidate onSubmit={(event) => {
      event.preventDefault();
      const value = email.trim();
      if (!looksLikeEmail(value)) {
        setError(value ? "Enter a valid email address." : "Enter your email address.");
        return;
      }
      setError(null);
      start.mutate(value, {
        onSuccess: () => setSentTo(value),
        onError: () => setError("Couldn't send the link. Try again."),
      });
    }}>
      <Field label="Email" error={error}>
        <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false}
          placeholder="you@example.com" value={email}
          onChange={(event) => { setEmail(event.target.value); setError(null); }} />
      </Field>
      <Button type="submit" variant="primary" icon={EnvelopeSimple} pending={start.isPending}>
        {resend ? "Resend link" : "Send link"}
      </Button>
    </form>
    {sentTo && !error && <Alert tone="success">Link sent to {sentTo}. Open it on this device to finish signing in.</Alert>}
    {onRestart && <div><Button variant="secondary" size="compact" onClick={onRestart}>Start over</Button></div>}
  </Stack>;
}
