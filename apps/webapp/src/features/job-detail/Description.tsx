import { Fragment, type ReactNode } from "react";
import type { DescriptionBlock, DescriptionRun } from "@pinkslip/core/job-description";
import styles from "./JobDetail.module.css";

function Runs({ runs }: { runs: DescriptionRun[] }) {
  return runs.map((run, index) => {
    let node: ReactNode = run.text;
    if (run.italic) node = <em>{node}</em>;
    if (run.bold) node = <strong>{node}</strong>;
    if (run.href) node = <a href={run.href} target="_blank" rel="noopener noreferrer nofollow">{node}</a>;
    return <Fragment key={index}>{node}</Fragment>;
  });
}

/** A posting as headings, paragraphs and lists (`parseJobDescription`, the
 * same blocks the iOS app draws). Pure data, so the server renders it and no
 * posting HTML reaches the page. */
export function Description({ blocks }: { blocks: DescriptionBlock[] }) {
  return <div className={styles.description}>
    {blocks.map((block, index) => {
      if (block.kind === "heading") return <h3 key={index}><Runs runs={block.runs} /></h3>;
      if (block.kind === "paragraph") return <p key={index}><Runs runs={block.runs} /></p>;
      const List = block.ordered ? "ol" : "ul";
      return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Runs runs={item} /></li>)}</List>;
    })}
  </div>;
}
