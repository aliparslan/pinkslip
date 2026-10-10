import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/library")({ ssr: true, component: Outlet });
