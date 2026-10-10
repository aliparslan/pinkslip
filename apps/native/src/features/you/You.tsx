import { useSession, useSignOut } from "@pinkslip/data";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { Wrench } from "phosphor-react-native";
import { useUnistyles } from "react-native-unistyles";
import { ListRow, ListSection, Screen, SegmentedControl, Stack, Text, toast } from "../../kit";
import { setAppearancePreference, useAppearancePreference, type AppearancePreference } from "../../theme/appearance";
import { useAppleSignIn } from "../account/useSignIn";

/** 6-A scaffold of You: who you are, Sign in with Apple, Appearance and sign
 * out. 6.7 adds the settings rows. */
export function You() {
  const { theme } = useUnistyles();
  const session = useSession();
  const signIn = useAppleSignIn();
  const signOut = useSignOut();
  const appearance = useAppearancePreference();
  const signedIn = session.data?.state === "authenticated";
  const account = session.data?.me?.account;

  return <Screen>
    <ListSection label="Account">
      <ListRow title={signedIn ? (account?.email ?? "Signed in") : "Browsing as a guest"}
        detail={signedIn ? (account?.provider === "apple" ? "Apple" : "Email") : "Sign in to keep your jobs on every device"} />
    </ListSection>
    {!signedIn && <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={theme.mode === "light" || theme.mode === "lightContrast" ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={theme.radius.md} style={{ height: theme.sizing["control-height"] }}
      onPress={() => { if (!signIn.isPending) signIn.mutate(); }} />}
    <Stack gap="2">
      <Text size="xs" weight="semibold" tone="ink-4">Appearance</Text>
      <SegmentedControl<AppearancePreference> value={appearance} onValueChange={setAppearancePreference}
        segments={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
    </Stack>
    {signedIn && <ListSection>
      <ListRow title="Log out" destructive onPress={() => signOut.mutate(undefined, {
        onSuccess: () => toast.success("Logged out"),
        onError: () => toast.error("Couldn't log out. Try again."),
      })} />
    </ListSection>}
    {__DEV__ && <ListSection label="Development">
      <ListRow title="Kit" icon={Wrench} onPress={() => router.push("/you/kit")} />
    </ListSection>}
  </Screen>;
}
