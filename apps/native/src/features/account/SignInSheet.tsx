import { ApiError } from "@pinkslip/core/api";
import { queryKeys, useApi } from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AppleSignInCanceled, signInWithApple } from "../../platform/apple";
import { GoogleSignInCanceled, signInWithGoogle } from "../../platform/google";
import { haptics } from "../../platform/haptics";
import {
  Button, CODE_LENGTH, CodeBoxes, ProviderButton, SheetBack, SheetHeader, SheetModal, SheetStep, SignInField, Text, toast, useSheet,
} from "../../ui";
import { onSignInRequest, type SignInRequest } from "./sign-in-request";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const OFFLINE = "You're offline. Connect, then try again.";

/** Network failures reach us as plain errors; the API's own refusals as ApiError. */
const offline = (error: unknown) => !(error instanceof ApiError);

/** The sign-in sheet, over whatever page opened it (`openSignIn`). */
export function SignInHost() {
  const [request, setRequest] = useState<SignInRequest | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => onSignInRequest((next) => {
    setRequest(next);
    setOpen(true);
  }), []);
  const closed = () => {
    setOpen(false);
    request?.onClosed?.();
    setRequest(null);
  };
  return <SheetModal open={open} onClosed={closed}>
    {request ? <SignInSteps request={request} /> : null}
  </SheetModal>;
}

type Step = "ask" | "email" | "code";
type Move = "forward" | "back";
const ORDER: Step[] = ["ask", "email", "code"];

/**
 * Paper "Sign in · Oct 15": S1, the three ways in (approved as K1); S2, your
 * email; S4, the six-digit code, which signs you in or makes the account.
 * Apple and Google finish in the iPhone's own sheets. What goes wrong is one
 * short `bad` line where it went wrong (E1, E6 to E9). Passwords (S3a, S3b)
 * come later. Signed in, the sheet closes and the page behind shows it.
 */
function SignInSteps({ request }: { request: SignInRequest }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const sheet = useSheet();
  const [step, setStep] = useState<Step>("ask");
  // A step leaves the way the next one is coming from (as onboarding's
  // questions do), so the step in front is drawn for the move first.
  const [leaving, setLeaving] = useState<{ move: Move; to: Step } | null>(null);
  const [arrived, setArrived] = useState<Move>("forward");
  const [busy, setBusy] = useState<"apple" | "google" | "email" | "code" | "resend" | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<"wrong" | "expired" | "offline" | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    setArrived(leaving.move);
    setStep(leaving.to);
    setLeaving(null);
  }, [leaving]);
  const go = (to: Step) => setLeaving({ move: ORDER.indexOf(to) > ORDER.indexOf(step) ? "forward" : "back", to });

  const signedIn = async () => {
    haptics.success();
    await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
    sheet.close();
  };

  const withProvider = async (provider: "apple" | "google") => {
    if (busy) return;
    setBusy(provider);
    setAskError(null);
    try {
      await (provider === "apple" ? signInWithApple(api) : signInWithGoogle(api));
      await signedIn();
    } catch (error) {
      if (error instanceof AppleSignInCanceled || error instanceof GoogleSignInCanceled) return;
      setAskError(offline(error) ? OFFLINE : `${provider === "apple" ? "Apple" : "Google"} sign-in didn't finish. Try again.`);
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async (again: boolean) => {
    const value = email.trim();
    if (!looksLikeEmail(value)) {
      setEmailError(value ? "That email looks incomplete." : "Enter your email.");
      return;
    }
    setBusy(again ? "resend" : "email");
    setEmailError(null);
    try {
      await api.auth.startEmailCode(value);
      setCode("");
      setCodeError(null);
      setResent(again);
      if (!again) go("code");
    } catch (error) {
      const message = offline(error) ? OFFLINE : error instanceof ApiError && error.code === "email_unavailable" ? error.message : "Couldn't send the code. Try again.";
      if (!again) setEmailError(message);
      else if (offline(error)) setCodeError("offline");
      else toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const enterCode = async (value: string) => {
    setCode(value);
    if (codeError && codeError !== "expired") setCodeError(null);
    if (value.length < CODE_LENGTH || busy) return;
    setBusy("code");
    try {
      await api.auth.verifyEmailCode({ email: email.trim(), code: value });
      await signedIn();
    } catch (error) {
      if (offline(error)) setCodeError("offline");
      else if (error instanceof ApiError && error.code === "expired_code") setCodeError("expired");
      else setCodeError("wrong");
    } finally {
      setBusy(null);
    }
  };

  const inner = leaving ? leaving.move === "back" : arrived === "forward";

  if (step === "email") {
    return <SheetStep id="email" inner={inner}>
      <SheetHeader title="Your email" />
      <View style={styles.tight}>
        <SignInField label="Email" value={email} invalid={Boolean(emailError)} autoFocus keyboardType="email-address"
          textContentType="emailAddress" autoComplete="email" returnKeyType="go" onSubmitEditing={() => void sendCode(false)}
          onChangeText={(text) => { setEmail(text); setEmailError(null); }} />
        {emailError ? <View style={styles.errorLine}><Text role="footnote" tone="bad">{emailError}</Text></View> : null}
      </View>
      <View style={styles.actions}>
        <SheetBack onPress={() => go("ask")} />
        <View style={styles.flex}>
          <Button variant="primary" fullWidth pending={busy === "email"} onPress={() => void sendCode(false)}>Continue</Button>
        </View>
      </View>
    </SheetStep>;
  }

  if (step === "code") {
    const line = codeError === "wrong" ? "That code isn't right." : codeError === "expired" ? "That code has expired." : codeError === "offline" ? OFFLINE : null;
    return <SheetStep id="code" inner={inner}>
      <View style={styles.heading}>
        <SheetHeader title="Check your email" />
        <Text role="subhead" tone="ink-2">{`${resent ? "New code" : "Code"} sent to ${email.trim()}`}</Text>
      </View>
      <View style={styles.tight}>
        <CodeBoxes value={code} onChangeText={(value) => void enterCode(value)} invalid={codeError === "wrong"} faded={codeError === "expired"} />
        {line ? <Text role="footnote" tone="bad">{line}</Text> : null}
      </View>
      <View style={styles.actions}>
        <SheetBack onPress={() => go("email")} />
        <View style={styles.flex}>
          {codeError === "expired"
            ? <Button variant="primary" fullWidth pending={busy === "resend"} onPress={() => void sendCode(true)}>Send a new code</Button>
            : <Button variant="text" fullWidth pending={busy === "resend" || busy === "code"} onPress={() => void sendCode(true)}>Send it again</Button>}
        </View>
      </View>
    </SheetStep>;
  }

  return <SheetStep id="ask" inner={inner}>
    <View style={styles.heading}>
      <SheetHeader title={request.title ?? "Sign in"} />
      {askError ? <Text role="subhead" tone="bad">{askError}</Text>
        : request.detail ? <Text role="body" tone="ink-2">{request.detail}</Text> : null}
    </View>
    <View style={styles.ways}>
      <ProviderButton provider="apple" pending={busy === "apple"} disabled={Boolean(busy)} onPress={() => void withProvider("apple")}>Continue with Apple</ProviderButton>
      <ProviderButton provider="google" pending={busy === "google"} disabled={Boolean(busy)} onPress={() => void withProvider("google")}>Continue with Google</ProviderButton>
      <ProviderButton provider="email" disabled={Boolean(busy)} onPress={() => { setAskError(null); go("email"); }}>Continue with email</ProviderButton>
    </View>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  heading: { gap: theme.ui.space["1"] },
  ways: { gap: theme.ui.space["3"] },
  tight: { gap: theme.ui.space["2"] },
  errorLine: { paddingHorizontal: theme.ui.space["4"] },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  flex: { flex: 1 },
}));
