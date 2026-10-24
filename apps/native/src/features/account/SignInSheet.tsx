import { ApiError, type ApiClient, type MeResponse } from "@pinkslip/core/api";
import { notificationSettingsQueryOptions, queryKeys, useApi, useUpdateNotificationSettings, type Session } from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AppleSignInCanceled, signInWithApple } from "../../platform/apple";
import { WEB_URL } from "../../platform/config";
import { GoogleSignInCanceled, signInWithGoogle } from "../../platform/google";
import { haptics } from "../../platform/haptics";
import { devicePushStatus, enableDevicePush } from "../../platform/push";
import { storage } from "../../platform/storage";
import {
  AlertPreview, Button, CODE_LENGTH, CodeBoxes, ProviderButton, SheetBack, SheetHeader, SheetModal, SheetStep, SignInField, Text, toast, useSheet,
} from "../../ui";
import { onSignInRequest, type SignInRequest } from "./sign-in-request";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const OFFLINE = "You're offline. Connect, then try again.";
const SHORT = "Use at least 8 characters.";
/** The alerts ask (S5) comes once, after the first sign-in on this phone. */
const ALERTS_ASKED = "signIn.alertsAsked";

/** Network failures reach us as plain errors; the API's own refusals as ApiError. */
const offline = (error: unknown) => !(error instanceof ApiError);

type SignInAuth = Pick<ApiClient["auth"], "startEmailCode" | "verifyEmailCode" | "signInWithPassword" | "setPassword">;

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

type Step = "ask" | "email" | "password" | "code" | "make" | "alerts";
type Move = "forward" | "back";
const ORDER: Step[] = ["ask", "email", "password", "code", "make", "alerts"];

/**
 * Paper "Sign in · Oct 15" (S1 approved as K1) and "Sign in, code first ·
 * Oct 19" (owner, 2026-10-19): the three ways in; your email, which sends a
 * code first, with "Use my password" under it; the six-digit code, which
 * signs you in or makes the account, with Back and a grey "Send it again"
 * (A); then, if the account has no password, "Make a password" or Not now
 * (A3; "Forgot it?" lands there too, as a new one). A wrong password never
 * says which part was wrong (B1); too many tries turns the way on into a
 * code (B2). Apple and Google finish in the iPhone's own sheets. After the
 * first sign-in on this phone, one alerts ask if alerts are off (S5).
 */
function SignInSteps({ request }: { request: SignInRequest }) {
  const api = useApi();
  const auth = useMemo<SignInAuth>(() => (request.sample ? sampleAuth() : api.auth), [request.sample, api]);
  const queryClient = useQueryClient();
  const updateAlerts = useUpdateNotificationSettings();
  const sheet = useSheet();
  const [step, setStep] = useState<Step>("ask");
  // A step leaves the way the next one is coming from (as onboarding's
  // questions do), so the step in front is drawn for the move first.
  const [leaving, setLeaving] = useState<{ move: Move; to: Step } | null>(null);
  const [arrived, setArrived] = useState<Move>("forward");
  const [busy, setBusy] = useState<"apple" | "google" | "email" | "code" | "resend" | "password" | "make" | "alerts" | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<"wrong" | "paused" | "offline" | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<"wrong" | "expired" | "offline" | null>(null);
  const [resent, setResent] = useState(false);
  // The code came from "Forgot it?", so a new password follows it.
  const [reset, setReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!leaving) return;
    setArrived(leaving.move);
    setStep(leaving.to);
    setLeaving(null);
  }, [leaving]);
  const go = (to: Step) => setLeaving({ move: ORDER.indexOf(to) > ORDER.indexOf(step) ? "forward" : "back", to });

  /** The alerts ask, once per phone, only if new-job alerts aren't reaching it. */
  const alertsAskDue = async () => {
    if (request.sample) return true;
    if (storage.getBoolean(ALERTS_ASKED)) return false;
    storage.set(ALERTS_ASKED, true);
    try {
      const device = await devicePushStatus();
      if (device === "denied" || device === "unsupported") return false;
      const settings = await queryClient.fetchQuery(notificationSettingsQueryOptions(api));
      return device !== "enabled" || !settings.kinds.new_jobs.enabled;
    } catch {
      return false;
    }
  };
  const finish = async () => {
    if (await alertsAskDue()) go("alerts");
    else sheet.close();
  };

  /** Signed in: the page behind shows it. After a code, a password can follow. */
  const signedIn = async (afterCode: MeResponse | null) => {
    haptics.success();
    if (!request.sample) await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
    const features = request.sample ? { password_after_code_enabled: true } : queryClient.getQueryData<Session>(queryKeys.session())?.me?.features;
    if (afterCode && features?.password_after_code_enabled && (reset || !afterCode.account?.has_password)) {
      setNewPassword("");
      setNewPasswordError(null);
      go("make");
      return;
    }
    await finish();
  };

  const withProvider = async (provider: "apple" | "google") => {
    if (busy) return;
    setBusy(provider);
    setAskError(null);
    try {
      if (!request.sample) await (provider === "apple" ? signInWithApple(api) : signInWithGoogle(api));
      await signedIn(null);
    } catch (error) {
      if (error instanceof AppleSignInCanceled || error instanceof GoogleSignInCanceled) return;
      setAskError(offline(error) ? OFFLINE : `${provider === "apple" ? "Apple" : "Google"} sign-in didn't finish. Try again.`);
    } finally {
      setBusy(null);
    }
  };

  /** True when the email is one to send to; says what's wrong under the field otherwise. */
  const checkEmail = () => {
    const value = email.trim();
    if (looksLikeEmail(value)) return true;
    setEmailError(value ? "That email looks incomplete." : "Enter your email.");
    return false;
  };

  const sendCode = async (again: boolean) => {
    if (!checkEmail()) {
      if (step !== "email") go("email");
      return;
    }
    setBusy(again ? "resend" : "email");
    setEmailError(null);
    try {
      await auth.startEmailCode(email.trim());
      setCode("");
      setCodeError(null);
      setResent(again);
      if (!again) go("code");
    } catch (error) {
      const message = offline(error) ? OFFLINE : error instanceof ApiError && error.code === "email_unavailable" ? error.message : "Couldn't send the code. Try again.";
      if (again && offline(error)) setCodeError("offline");
      else if (step === "email") setEmailError(message);
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
      await signedIn(await auth.verifyEmailCode({ email: email.trim(), code: value }));
    } catch (error) {
      if (offline(error)) setCodeError("offline");
      else if (error instanceof ApiError && error.code === "expired_code") setCodeError("expired");
      else setCodeError("wrong");
    } finally {
      setBusy(null);
    }
  };

  const usePassword = () => {
    if (!checkEmail()) return;
    setPasswordError(null);
    go("password");
  };

  const signInWithPassword = async () => {
    if (busy || !password) return;
    setBusy("password");
    setPasswordError(null);
    try {
      await auth.signInWithPassword({ email: email.trim(), password });
      await signedIn(null);
    } catch (error) {
      setPasswordError(offline(error) ? "offline" : error instanceof ApiError && error.code === "password_rate_limited" ? "paused" : "wrong");
    } finally {
      setBusy(null);
    }
  };

  /** "Forgot it?": a code proves the email, then a new password. */
  const forgot = () => {
    setReset(true);
    void sendCode(false);
  };

  const makePassword = async () => {
    if (busy) return;
    if (newPassword.length < 8) {
      setNewPasswordError(SHORT);
      return;
    }
    setBusy("make");
    setNewPasswordError(null);
    try {
      await auth.setPassword(newPassword);
      haptics.success();
      await finish();
    } catch (error) {
      setNewPasswordError(offline(error) ? OFFLINE : error instanceof ApiError && error.code === "weak_password" ? SHORT : "Couldn't save the password. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const turnOnAlerts = async () => {
    if (busy) return;
    if (request.sample) return sheet.close();
    setBusy("alerts");
    try {
      if (await enableDevicePush(api) === "enabled") await updateAlerts.mutateAsync({ kinds: { new_jobs: { enabled: true } } });
    } catch {
      toast.error("Couldn't turn on alerts. Try again in Alerts.");
    } finally {
      setBusy(null);
      sheet.close();
    }
  };

  const inner = leaving ? leaving.move === "back" : arrived === "forward";

  if (step === "email") {
    return <SheetStep id="email" inner={inner}>
      <SheetHeader title="Your email" />
      <View style={styles.tight}>
        <SignInField label="Email" value={email} invalid={Boolean(emailError)} autoFocus keyboardType="email-address"
          textContentType="emailAddress" autoComplete="email" returnKeyType="go" onSubmitEditing={() => { setReset(false); void sendCode(false); }}
          onChangeText={(text) => { setEmail(text); setEmailError(null); }} />
        {emailError ? <View style={styles.errorLine}><Text role="footnote" tone="bad">{emailError}</Text></View> : null}
      </View>
      <View style={styles.answers}>
        <View style={styles.actions}>
          <SheetBack onPress={() => go("ask")} />
          <View style={styles.flex}>
            <Button variant="primary" fullWidth pending={busy === "email"} onPress={() => { setReset(false); void sendCode(false); }}>Send me a code</Button>
          </View>
        </View>
        <Button variant="text" fullWidth disabled={Boolean(busy)} onPress={usePassword}>Use my password</Button>
      </View>
    </SheetStep>;
  }

  if (step === "password") {
    const paused = passwordError === "paused";
    const line = passwordError === "wrong" ? "That email and password don't match."
      : paused ? "Too many tries. Wait a few minutes, or use a code." : passwordError === "offline" ? OFFLINE : null;
    return <SheetStep id="password" inner={inner}>
      <View style={styles.heading}>
        <SheetHeader title="Your password" />
        <Text role="subhead" tone="ink-2">{email.trim()}</Text>
      </View>
      <View style={styles.tight}>
        <SignInField label="Password" value={password} invalid={passwordError === "wrong" || paused} autoFocus secureTextEntry
          textContentType="password" autoComplete="current-password" returnKeyType="go" onSubmitEditing={() => void signInWithPassword()}
          onChangeText={(text) => { setPassword(text); if (!paused) setPasswordError(null); }} />
        {line ? <View style={styles.errorLine}><Text role="footnote" tone="bad">{line}</Text></View> : null}
      </View>
      <View style={styles.answers}>
        <View style={styles.actions}>
          <SheetBack onPress={() => go("email")} />
          <View style={styles.flex}>
            {paused
              ? <Button variant="primary" fullWidth pending={busy === "email"} onPress={forgot}>Email me a code</Button>
              : <Button variant="primary" fullWidth pending={busy === "password"} onPress={() => void signInWithPassword()}>Sign in</Button>}
          </View>
        </View>
        {paused ? null : <Button variant="text" fullWidth disabled={Boolean(busy)} onPress={forgot}>Forgot it? Email me a code</Button>}
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
      {/* Back and a grey button, the email step's shape (owner, A); an
          expired code turns it pink. */}
      <View style={styles.actions}>
        <SheetBack onPress={() => go(reset ? "password" : "email")} />
        <View style={styles.flex}>
          <Button variant={codeError === "expired" ? "primary" : "secondary"} fullWidth pending={busy === "resend"} disabled={busy === "code"}
            onPress={() => void sendCode(true)}>{codeError === "expired" ? "Send a new code" : "Send it again"}</Button>
        </View>
      </View>
    </SheetStep>;
  }

  if (step === "make") {
    return <SheetStep id="make" inner={inner}>
      <View style={styles.heading}>
        <SheetHeader title={reset ? "Make a new password" : "Make a password"} />
        <Text role="subhead" tone="ink-2">{email.trim()}</Text>
      </View>
      <View style={styles.tight}>
        <SignInField label="Password" value={newPassword} invalid={Boolean(newPasswordError)} autoFocus secureTextEntry
          textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={() => void makePassword()}
          onChangeText={(text) => { setNewPassword(text); setNewPasswordError(null); }} />
        {newPasswordError ? <View style={styles.errorLine}><Text role="footnote" tone="bad">{newPasswordError}</Text></View> : null}
      </View>
      <View style={styles.answers}>
        <Button variant="primary" fullWidth pending={busy === "make"} onPress={() => void makePassword()}>Save password</Button>
        <Button variant="text" fullWidth disabled={busy === "make"} onPress={() => void finish()}>Not now</Button>
      </View>
    </SheetStep>;
  }

  if (step === "alerts") {
    return <SheetStep id="alerts" inner={inner}>
      <SheetHeader title="Be first to apply" />
      <AlertPreview />
      <View style={styles.answers}>
        <Button variant="primary" fullWidth pending={busy === "alerts"} onPress={() => void turnOnAlerts()}>Turn on alerts</Button>
        <Button variant="text" fullWidth disabled={busy === "alerts"} onPress={sheet.close}>Not now</Button>
      </View>
    </SheetStep>;
  }

  return <SheetStep id="ask" inner={inner}>
    <View style={styles.heading}>
      <SheetHeader title={request.title ?? "Sign in"} />
      {askError ? <Text role="subhead" tone="bad">{askError}</Text>
        : request.detail ? <Text role="body" tone="ink-2">{request.detail}</Text> : null}
    </View>
    <View style={styles.answers}>
      <View style={styles.ways}>
        <ProviderButton provider="apple" pending={busy === "apple"} disabled={Boolean(busy)} onPress={() => void withProvider("apple")}>Continue with Apple</ProviderButton>
        <ProviderButton provider="google" pending={busy === "google"} disabled={Boolean(busy)} onPress={() => void withProvider("google")}>Continue with Google</ProviderButton>
        <ProviderButton provider="email" disabled={Boolean(busy)} onPress={() => { setAskError(null); go("email"); }}>Continue with email</ProviderButton>
      </View>
      {request.notNow ? <Button variant="text" fullWidth disabled={Boolean(busy)} onPress={sheet.close}>Not now</Button> : null}
    </View>
    <TermsLine />
  </SheetStep>;
}

/** Under the ways in (Paper "Sign in · Oct 15", S1): what continuing agrees
 * to, each page opening in the in-app browser over the sheet. */
function TermsLine() {
  const { theme } = useUnistyles();
  const open = (path: "/terms" | "/privacy") => void WebBrowser.openBrowserAsync(`${WEB_URL}${path}`, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: theme.ui.color.accent,
  });
  return <Text role="footnote" tone="ink-3" align="center">
    By continuing you agree to the{" "}
    <Text role="footnote" tone="ink-3" accessibilityRole="link" onPress={() => open("/terms")}>Terms</Text>
    {" "}and{" "}
    <Text role="footnote" tone="ink-3" accessibilityRole="link" onPress={() => open("/privacy")}>Privacy Policy</Text>.
  </Text>;
}

/**
 * The kit's walk-through: every step and what goes wrong, with nothing sent
 * to Pinkslip. Any code signs in but 000000; a password is wrong twice, then
 * too many tries; a password under 8 characters is too short.
 */
function sampleAuth(): SignInAuth {
  let misses = 0;
  const wait = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 600));
  const me = { user: null, session: { state: "authenticated" }, is_admin: false,
    account: { authenticated: true, email: "jordan@lee.dev", providers: ["email"], has_password: false } } as MeResponse;
  return {
    startEmailCode: () => wait({ ok: true, expires_at: "" }),
    verifyEmailCode: async ({ code }) => {
      if (code === "000000") throw new ApiError("That code isn't right", 401, "wrong_code");
      return wait(me);
    },
    signInWithPassword: async () => {
      await wait(null);
      misses += 1;
      if (misses > 2) throw new ApiError("Too many tries", 429, "password_rate_limited");
      throw new ApiError("That email and password don't match", 401, "wrong_password");
    },
    setPassword: async (password) => {
      if (password.length < 8) throw new ApiError(SHORT, 400, "weak_password");
      return wait(me);
    },
  };
}

const styles = StyleSheet.create((theme) => ({
  heading: { gap: theme.ui.space["1"] },
  ways: { gap: theme.ui.space["3"] },
  tight: { gap: theme.ui.space["2"] },
  answers: { gap: theme.ui.space["2"] },
  errorLine: { paddingHorizontal: theme.ui.space["4"] },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  flex: { flex: 1 },
}));
