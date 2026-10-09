import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/you")({
  ssr: false,
  loader: async () => {
    const response = await fetch("/api/v2/me", { credentials: "same-origin" });
    if (response.status === 401) return { state: "anonymous" };
    if (!response.ok) throw new Error("Your account couldn’t be loaded.");
    const account: { session: { state: string } } = await response.json();
    return account.session;
  },
  component: You,
});

function You() {
  const session = Route.useLoaderData();
  return <section>
    <h1>You</h1>
    <p>{session.state === "authenticated" ? "You’re signed in." : "Your account and preferences will live here."}</p>
  </section>;
}
