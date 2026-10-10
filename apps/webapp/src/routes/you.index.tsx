import { createFileRoute } from "@tanstack/react-router";
import { useOwnerChangeCleanup, useSession } from "@pinkslip/data";
import { Heading } from "../kit";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/")({
  ssr: false,
  staticData: { page: pages["/you"] },
  head: () => pageHead(pages["/you"]),
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
