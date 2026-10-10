import { Heading } from "../../kit";
import { BrandMark } from "../shell/BrandMark";
import styles from "./Split.module.css";

/** The empty side of the wide layout, before a job is open. */
export function SelectJob() {
  return <div className={styles.placeholder}>
    <span className={styles.placeholderMark} aria-hidden><BrandMark size={28} /></span>
    <Heading level={2} variant="display-sm">Select a job</Heading>
    <p className={styles.placeholderMessage}>Choose a role from the list to see the details without losing your place.</p>
  </div>;
}
