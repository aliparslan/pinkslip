import { createFileRoute, Outlet } from "@tanstack/react-router";

// Session ownership and access rules are added to this route family in 3.2.
export const Route = createFileRoute("/you")({ ssr: true, component: Outlet });
