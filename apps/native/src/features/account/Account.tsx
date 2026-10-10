import { useAutosave, useDeleteAccount, useSession, useSignOut, useStartEmailLogin, useUpdateName } from "@pinkslip/data";
import * as AppleAuthentication from "expo-apple-authentication";
import { router, Stack as RouterStack } from "expo-router";
import { EnvelopeSimple } from "phosphor-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Badge, Button, Field, Inline, Input, SaveStatus, Screen, Stack, Surface, Text, toast } from "../../kit";
import { clearResumeFile } from "../../platform/resume-file";
import { useAppleSignIn } from "./useSignIn";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Account (`AccountSection.svelte`): your name, how you're signed in (Apple
 * or an email link), and log out / start over / delete. */
export function Account() {
  const { data: session } = useSession();
  const signedIn = session?.state === "authenticated";
  const account = session?.me?.account;
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();
  const [name, setName] = useState(session?.me?.user?.name ?? "");
  const updateName = useUpdateName();
  const autosave = useAutosave({ value: name.trim(), ready: Boolean(session), save: (next) => (next ? updateName.mutateAsync(next) : Promise.resolve()) });

  const leave = (restart: boolean) => Alert.alert(restart ? "Start over?" : "Log out?",
    restart ? "This starts a fresh guest profile. Your current saved jobs and preferences won't come with you." : "You'll be signed out on this iPhone. Your account stays saved.", [
      { text: "Cancel", style: "cancel" },
      { text: restart ? "Start over" : "Log out", style: restart ? "destructive" : "default", onPress: () => signOut.mutate(undefined, {
        onSuccess: () => { clearResumeFile(); toast.success(restart ? "Started over" : "Signed out"); router.replace(restart ? "/welcome" : "/"); },
        onError: () => toast.error("Couldn't sign out. Try again."),
      }) },
    ]);
  const remove = () => Alert.alert("Delete your account?", "This permanently deletes your account, saved jobs, applications and resume. It can't be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete account", style: "destructive", onPress: () => deleteAccount.mutate(undefined, {
      onSuccess: (response) => {
        clearResumeFile();
        toast.success(response.apple_revoke_required
          ? "Account deleted. Remove Pinkslip under Sign in with Apple in Settings to finish."
          : "Account deleted. You can keep browsing as a guest.", { duration: 8000 });
      },
      onError: () => toast.error("Couldn't delete your account. Try again."),
    }) },
  ]);

  return <Screen>
    {/* An empty header item still draws a glass button, so it appears only with a status. */}
    <RouterStack.Screen options={{ headerRight: autosave.phase === "clean" ? undefined : () => <SaveStatus phase={autosave.phase} onRetry={autosave.retry} /> }} />
    <Field label="Name"><Input autoComplete="name" textContentType="name" placeholder="Your name" value={name} maxLength={80} onChangeText={setName} /></Field>
    {signedIn ? <Surface>
      <Stack gap="4">
        <Inline justify="between" gap="3">
          <Stack gap="1" flex>
            <Text weight="medium">Signed in</Text>
            <Text size="sm" tone="ink-3">{account?.email ?? "Your account is active"}{account?.provider ? ` · ${account.provider === "apple" ? "Apple" : "email"}` : ""}</Text>
          </Stack>
          <Badge>Synced</Badge>
        </Inline>
        <Inline gap="2">
          <Button onPress={() => leave(false)}>Log out</Button>
          <Button variant="danger" pending={deleteAccount.isPending} onPress={remove}>Delete account</Button>
        </Inline>
      </Stack>
    </Surface> : <SignIn onRestart={() => leave(true)} />}
  </Screen>;
}

function SignIn({ onRestart }: { onRestart: () => void }) {
  const { theme } = useUnistyles();
  const apple = useAppleSignIn();
  const start = useStartEmailLogin();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const resend = sentTo !== null && sentTo.toLowerCase() === email.trim().toLowerCase();
  const send = () => {
    const value = email.trim();
    if (!looksLikeEmail(value)) { setError(value ? "Enter a valid email address." : "Enter your email address."); return; }
    setError(null);
    start.mutate(value, { onSuccess: () => setSentTo(value), onError: () => setError("Couldn't send the link. Try again.") });
  };
  return <Stack gap="5">
    <Stack gap="1">
      <Text weight="medium">Browsing as a guest</Text>
      <Text size="sm" tone="ink-3">Sign in to keep your jobs and preferences on every device.</Text>
    </Stack>
    <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={theme.mode === "light" || theme.mode === "lightContrast" ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={theme.radius.md} style={{ height: theme.sizing["control-height"] }} onPress={() => { if (!apple.isPending) apple.mutate(); }} />
    <Stack gap="3">
      <Field label="Or get a sign-in link" error={error}>
        <Input keyboardType="email-address" autoComplete="email" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false}
          placeholder="you@example.com" value={email} onChangeText={(text) => { setEmail(text); setError(null); }} onSubmitEditing={send} returnKeyType="send" />
      </Field>
      <Button icon={EnvelopeSimple} pending={start.isPending} onPress={send}>{resend ? "Resend link" : "Send link"}</Button>
      {sentTo && !error && <Text size="sm" tone="good">Link sent to {sentTo}. Open it on this iPhone to finish signing in.</Text>}
    </Stack>
    <View><Button size="compact" onPress={onRestart}>Start over</Button></View>
  </Stack>;
}
