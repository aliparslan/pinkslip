import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSession, useSignOut } from "@pinkslip/data";
import { AlertDialog, Button, Heading, Stack, Surface, Text, toast } from "../kit";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/account")({
  ssr: false,
  staticData: { page: pages["/you/account"] },
  head: () => pageHead(pages["/you/account"]),
  component: Account,
});

/** Sign-out arrives with 3.2; email sign-in, the name field and account
 * deletion come with the full Account screen in Phase 4. */
function Account() {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const [confirming, setConfirming] = useState(false);
  const email = session?.me?.account?.email;
  const signedIn = session?.state === "authenticated";

  return <Stack gap="6">
    <Heading level={1} variant="screen">Account</Heading>
    <Surface variant="card">
      <Stack gap="4">
        <Stack gap="1">
          <Text weight="medium">{signedIn ? "Signed in" : "Not signed in"}</Text>
          <Text size="sm" tone="ink-3">
            {signedIn ? (email ?? "Signed in with Apple") : "You're browsing as a guest. Signing in arrives with the full Account screen."}
          </Text>
        </Stack>
        {signedIn && <Button variant="secondary" onClick={() => setConfirming(true)}>Log out</Button>}
      </Stack>
    </Surface>
    <AlertDialog
      open={confirming}
      onOpenChange={setConfirming}
      title="Log out?"
      description="You'll be signed out on this device. Your account data stays saved."
      confirmLabel="Log out"
      pending={signOut.isPending}
      onConfirm={() => signOut.mutate(undefined, {
        onSuccess: () => {
          setConfirming(false);
          toast.success("Signed out");
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't sign out. Try again."),
      })}
    />
  </Stack>;
}
