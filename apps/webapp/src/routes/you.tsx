import { createFileRoute } from "@tanstack/react-router";
import { useOwnerChangeCleanup, useSession } from "@pinkslip/data";
import { Heading } from "../kit";

export const Route = createFileRoute("/you")({
  ssr: false,
  component: You,
});

function You() {
  const session = useSession();
  useOwnerChangeCleanup();
  return <section>
    <Heading level={1} variant="root">You</Heading>
    {session.isPending
      ? <p>Loading your account…</p>
      : session.isError
        ? <p role="alert">Your account couldn’t be loaded. <button type="button" onClick={() => void session.refetch()}>Retry</button></p>
        : <p>{session.data?.state === "authenticated" ? "You’re signed in." : "Your account and preferences will live here."}</p>}
  </section>;
}
