import { useDeleteAccount, useSession, useSignOut, useUpdateName } from "@pinkslip/data";
import { router, Stack } from "expo-router";
import { Alert } from "react-native";
import { toast } from "../../../kit";
import { clearResumeFile } from "../../../platform/resume-file";
import { ListGroup, ListItem } from "../../../ui";
import { Account } from "../../account/Account";
import { YouPage } from "./Page";

export interface AccountViewProps {
  name: string;
  email: string | null;
  provider: "apple" | "email" | null;
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
  return <YouPage title="Account">
    <ListGroup surface="fill">
      <ListItem title="Name" value={name || "Add"} accessory="chevron" onPress={rename} />
      {email ? <ListItem title="Email" value={email} /> : null}
      {provider ? <ListItem title="Signed in with" value={provider === "apple" ? "Apple" : "Email link"} /> : null}
    </ListGroup>
    <ListGroup surface="fill">
      <ListItem title="Log out" onPress={logOut} />
    </ListGroup>
    <ListGroup surface="fill" footer="Removes your search, resume, answers and Tracker. You can keep browsing as a guest.">
      <ListItem title="Delete account" destructive onPress={remove} />
    </ListGroup>
  </YouPage>;
}

/** Account on the live session. A guest still gets today's sign-in page,
 * which the redesign hasn't drawn yet. */
export function AccountPage() {
  const session = useSession();
  const updateName = useUpdateName();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();
  if (session.data?.state !== "authenticated") {
    return <>
      <Stack.Screen options={{ headerShown: true, title: "Account" }} />
      <Account />
    </>;
  }
  const me = session.data.me;
  return <AccountView name={me?.user?.name ?? ""} email={me?.account?.email ?? null} provider={me?.account?.provider ?? null} actions={{
    rename: async (name) => {
      await updateName.mutateAsync(name);
    },
    logOut: async () => {
      await signOut.mutateAsync();
      clearResumeFile();
      toast.success("Signed out");
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
