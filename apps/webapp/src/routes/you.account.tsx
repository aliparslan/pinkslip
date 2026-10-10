import { createFileRoute } from "@tanstack/react-router";
import { Account } from "../features/account/Account";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/you/account")({
  ssr: false,
  staticData: { page: pages["/you/account"] },
  head: () => pageHead(pages["/you/account"]),
  component: Account,
});
