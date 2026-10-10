import { Separator as BaseSeparator } from "@base-ui/react/separator";
import styles from "./Separator.module.css";

/** The hairline `.divider` between sections. */
export function Separator({ orientation = "horizontal" }: { orientation?: "horizontal" | "vertical" }) {
  return <BaseSeparator orientation={orientation} className={styles.root} />;
}
