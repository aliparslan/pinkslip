import { createFileRoute, Outlet } from "@tanstack/react-router";

// Placeholders have no private data or actions. The admin guard lands in 3.2.
export const Route = createFileRoute("/admin")({ ssr: false, component: Outlet });
