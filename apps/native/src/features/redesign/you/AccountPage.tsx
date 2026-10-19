import { useDeleteAccount, useSession, useSignOut, useUpdateName } from "@pinkslip/data";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { clearResumeFile } from "../../../platform/resume-file";
import { ListGroup, ListItem, toast } from "../../../ui";
import { openSignIn } from "../../account/sign-in-request";
import { YouPage } from "./Page";

export interface AccountViewProps {
  name: string;
  email: string | null;
  provider: "apple" | "email" | "google" | null;
  actions: {
    rename: (name: string) => Promise<void>;
    logOut: () => Promise<void>;
    deleteAccount: () => Promise<{ appleRevokeRequired: boolean }>;
  };
}

/** Account (Paper "You · Oct 14", owner 2026-10-14): name, email and how
 * you sign in, then Log out, then Delete account on its own with what it
 * removes. The name changes in the iPhone's own prompt. */
export function AccountView({ name, email, provider, actions }: AccountViewProps) {
  const rename = () => Alert.prompt("Your name", undefined, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Save", isPreferred: true, onPress: (value?: string) => {
        const next = value?.trim();
        if (next && next !== name) actions.rename(next).catch(() => toast.error("Couldn't change your name. Try again."));
      },
    },
  ], "plain-text", name);
  const logOut = () => Alert.alert("Log out?", "You'll be signed out on this iPhone. Your account stays saved.", [
    { text: "Cancel", style: "cancel" },
    { text: "Log out", onPress: () => void actions.logOut().catch(() => toast.error("Couldn't sign out. Try again.")) },
  ]);
  const remove = () => Alert.alert("Delete your account?", "This permanently deletes your account, saved jobs, applications and resume. It can't be undone.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete account", style: "destructive", onPress: () => void actions.deleteAccount().then(({ appleRevokeRequired }) => toast.success(appleRevokeRequired
        ? "Account deleted. Remove Pinkslip under Sign in with Apple in Settings to finish."
        : "Account deleted. You can keep browsing as a guest.", { duration: 8000 }), () => toast.error("Couldn't delete your account. Try again.")),
    },
  ]);
  const signedIn = provider === "apple" ? "Signed in with Apple" : provider === "google" ? "Signed in with Google"
    : provider === "email" ? "Signed in with an email link" : undefined;
  return <YouPage title="Account">
    <ListGroup surface="fill">
      <ListItem title="Name" value={name || "Add"} accessory="chevron" onPress={rename} />
      {/* The address is the row, whole however long, with how you sign in
          under it (owner, 2026-10-14, Paper "Account · a long email" E3). */}
      {email ? <ListItem title={email} detail={signedIn} /> : signedIn ? <ListItem title={signedIn} /> : null}
    </ListGroup>
    <ListGroup surface="fill">
      <ListItem title="Log out" onPress={logOut} />
    </ListGroup>
    <ListGroup surface="fill" footer="Removes your search, resume, answers and Tracker. You can keep browsing as a guest.">
      <ListItem title="Delete account" destructive onPress={remove} />
    </ListGroup>
  </YouPage>;
}

/** Account on the live session. A guest who lands here (a link, an old
 * route) gets the sign-in sheet over it, and goes back if they close it. */
export function AccountPage() {
  const session = useSession();
  const updateName = useUpdateName();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();
  const signedIn = session.data?.state === "authenticated";
  const signedInNow = useRef(signedIn);
  signedInNow.current = signedIn;
  const guest = session.data !== undefined && !signedIn;
  useEffect(() => {
    if (!guest) return;
    openSignIn({ onClosed: () => { if (!signedInNow.current && router.canGoBack()) router.back(); } });
  }, [guest]);
  if (!signedIn) return <YouPage title="Account">{null}</YouPage>;
  const me = session.data?.me;
  return <AccountView name={me?.user?.name ?? ""} email={me?.account?.email ?? null} provider={me?.account?.provider ?? null} actions={{
    rename: async (name) => {
      await updateName.mutateAsync(name);
    },
    logOut: async () => {
      await signOut.mutateAsync();
      clearResumeFile();
      router.replace("/");
    },
    deleteAccount: async () => {
      const response = await deleteAccount.mutateAsync();
      clearResumeFile();
      router.back();
      return { appleRevokeRequired: Boolean(response.apple_revoke_required) };
    },
  }} />;
}
