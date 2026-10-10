import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Secondary options tucked under a toggle. The closed panel stays
 * findable with the browser's find in page. */
export function Disclosure({ summary, defaultOpen, children }: DisclosureProps) {
  return <Collapsible.Root className={styles.root} defaultOpen={defaultOpen}>
    <Collapsible.Trigger className={styles.trigger}>
      <span>{summary}</span>
      <span className={styles.caret} aria-hidden><CaretDown size={12} weight="bold" /></span>
    </Collapsible.Trigger>
    <Collapsible.Panel className={styles.panel} hiddenUntilFound>
      <div className={styles.body}>{children}</div>
    </Collapsible.Panel>
  </Collapsible.Root>;
}
