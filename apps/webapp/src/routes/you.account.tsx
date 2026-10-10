import { createFileRoute } from "@tanstack/react-router";
import { Account } from "../features/account/Account";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/account")({
  validateSearch: (search: Record<string, unknown>) => {
    const { apple, ...rest } = search;
    return { ...rest, apple: ["success", "cancelled", "error", "unavailable"].includes(String(apple)) ? String(apple) : undefined } as { apple?: string };
  },
  ssr: false,
  staticData: { page: pages["/you/account"] },
  head: () => pageHead(pages["/you/account"]),
  component: Account,
});
